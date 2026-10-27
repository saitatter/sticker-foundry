import hashlib
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .access import (
    Access,
    bump,
    check_version,
    pack_counts,
    public_pack,
    public_summary,
    quota,
    stickers,
    team_edit,
)
from .auth import current_user
from .common import audit, data, fail, iso, snake
from .config import get_settings
from .db import after_commit, get_db
from .exports import build_zip, content_hash, contents, export_stickers, manifest
from .media import apply_upload, stage_file
from .models import Pack, Sticker, User
from .schemas import CreatePack, MediaOptions, StickerIds, Transfer, UpdatePack, UpdateSticker
from .storage import get_storage

router = APIRouter(prefix="/packs", tags=["Packs"])
public_router = APIRouter(prefix="/public/packs", tags=["Public packs"])
sync_router = APIRouter(prefix="/sync", tags=["Offline sync"])


@router.get("")
def list_packs(user: User = Depends(current_user), db: Session = Depends(get_db)):
    access = Access(db, user.id)
    rows = list(db.scalars(access.visible().order_by(Pack.updated_at.desc(), Pack.name)))
    counts = pack_counts(db, [row.id for row in rows])
    return [access.summary(row, counts=counts.get(row.id, (0, 0))) for row in rows]


@router.post("", status_code=201)
def create_pack(payload: CreatePack, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if payload.teamId:
        team_edit(db, user.id, payload.teamId)
    row = Pack(owner_id=user.id, **{snake(key): value for key, value in payload.model_dump().items()})
    db.add(row)
    db.flush()
    audit(
        db,
        user.id,
        "pack.create",
        "pack",
        row.id,
        {"before": None, "after": data(row, exclude=("coverKey",))},
    )
    return Access(db, user.id).summary(row, detail=True)


@router.get("/{pack_id}")
def get_pack(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access = Access(db, user.id)
    return access.summary(access.get(pack_id), detail=True)


@router.patch("/{pack_id}")
def update_pack(
    pack_id: str, payload: UpdatePack, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    access = Access(db, user.id)
    row = access.get(pack_id, permission="manage", lock=True)
    before = data(row, exclude=("coverKey",))
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "description":
            setattr(row, snake(key), value)
    bump(row)
    db.flush()
    audit(
        db,
        user.id,
        "pack.update",
        "pack",
        pack_id,
        {
            "before": before,
            "after": data(row, exclude=("coverKey",)),
            "changedFields": list(payload.model_fields_set),
        },
    )
    return access.summary(row, detail=True)


def delete_pack_files(pack_id):
    get_storage().delete_pack(pack_id)
    root = get_settings().export_directory.resolve()
    for path in root.glob(f"{pack_id}-*.zip"):
        if path.resolve().is_relative_to(root):
            path.unlink(missing_ok=True)


@router.delete("/{pack_id}")
def delete_pack(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = Access(db, user.id).get(pack_id, permission="manage", lock=True)
    before = data(row, exclude=("coverKey",))
    db.delete(row)
    audit(db, user.id, "pack.delete", "pack", pack_id, {"before": before, "after": None})
    after_commit(db, lambda: delete_pack_files(pack_id))
    return {"deleted": True}


def copy_sticker(db, source, target, position):
    storage = get_storage()
    filename = f"{uuid4()}.webp"
    key = storage.pack_key(target.id, filename)
    stage_file(db, key, storage.read(source.storage_key))
    row = Sticker(
        pack_id=target.id,
        file_name=filename,
        storage_key=key,
        position=position,
        mime_type=source.mime_type,
        width=source.width,
        height=source.height,
        emojis=list(source.emojis),
        accessibility_text=source.accessibility_text,
        size_bytes=source.size_bytes,
        sha256=source.sha256,
        perceptual_hash=source.perceptual_hash,
        review_status=source.review_status,
    )
    db.add(row)
    return row


@router.post("/{pack_id}/clone", status_code=201)
def clone_pack(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    access = Access(db, user.id)
    source = access.get(pack_id)
    rows = stickers(db, pack_id)
    if access.role(source) is None and source.requires_approval:
        rows = [row for row in rows if row.review_status == "APPROVED"]
    quota(db, user.id, sum(row.size_bytes for row in rows))
    target = Pack(
        owner_id=user.id,
        name=(source.name + " Copy")[:128],
        publisher=source.publisher,
        description=source.description,
        is_animated=source.is_animated,
    )
    db.add(target)
    db.flush()
    for index, row in enumerate(rows):
        copy_sticker(db, row, target, index)
    if source.cover_key:
        target.cover_key = get_storage().new_cover_key(target.id)
        stage_file(db, target.cover_key, get_storage().read(source.cover_key))
    db.flush()
    audit(
        db,
        user.id,
        "pack.clone",
        "pack",
        target.id,
        {"sourcePackId": source.id, "after": data(target, exclude=("coverKey",))},
    )
    return Access(db, user.id).summary(target, detail=True)


async def media_options(request: Request):
    form = await request.form()
    values = {}
    files = 0
    for key, value in form.multi_items():
        if hasattr(value, "file"):
            files += 1
            continue
        if key in values:
            fail(400, f"Repeated upload option: {key}")
        if key == "emojis":
            try:
                value = (
                    json.loads(value)
                    if value.strip().startswith("[")
                    else [part.strip() for part in value.split(",") if part.strip()]
                )
            except (ValueError, TypeError):
                fail(400, "Invalid emoji list")
        values[key] = value
    if files != 1:
        fail(400, "Exactly one image file is required")
    try:
        return MediaOptions.model_validate(values)
    except ValidationError as error:
        fail(400, "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in error.errors()))


def upload_bytes(file, *, tray=False):
    if not file.content_type or not file.content_type.startswith("image/"):
        fail(400, "Only image uploads are accepted")
    limit = (5 if tray else 10) * 1024 * 1024
    value = file.file.read(limit + 1)
    if len(value) > limit:
        fail(413, f"Image upload exceeds {limit} bytes")
    if not value:
        fail(400, "The image is empty")
    return value


@router.post("/{pack_id}/stickers", status_code=201)
def upload_sticker(
    pack_id: str,
    request: Request,
    file: UploadFile = File(...),
    options: MediaOptions = Depends(media_options),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return apply_upload(
        db, user.id, pack_id, upload_bytes(file), options, version=request.headers.get("if-match")
    )


@router.post("/{pack_id}/stickers/jobs", status_code=202)
def queue_upload(
    pack_id: str,
    request: Request,
    file: UploadFile = File(...),
    options: MediaOptions = Depends(media_options),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    from .jobs import assert_queue_capacity, enqueue

    pack = Access(db, user.id).get(pack_id, permission="edit", lock=True)
    check_version(pack, request.headers.get("if-match"))
    if len(stickers(db, pack_id)) >= 30:
        fail(400, "A pack can contain at most 30 stickers")
    assert_queue_capacity(db)
    raw = upload_bytes(file)
    key = get_storage().safe_key(f"{get_settings().s3_prefix}/jobs/{uuid4()}/input")
    stage_file(db, key, raw)
    return enqueue(db, user.id, "media", {"inputKey": key, "options": options.model_dump()}, pack_id=pack_id)


@router.put("/{pack_id}/stickers/{sticker_id}/file")
def replace_image(
    pack_id: str,
    sticker_id: str,
    request: Request,
    file: UploadFile = File(...),
    options: MediaOptions = Depends(media_options),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return apply_upload(
        db,
        user.id,
        pack_id,
        upload_bytes(file),
        options,
        replace_id=sticker_id,
        version=request.headers.get("if-match"),
    )


@router.post("/{pack_id}/tray-icon", status_code=201)
def upload_tray(
    pack_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return apply_upload(
        db,
        user.id,
        pack_id,
        upload_bytes(file, tray=True),
        MediaOptions(backgroundRemovalMode="none"),
        tray=True,
        version=request.headers.get("if-match"),
    )


def find_sticker(db, pack_id, sticker_id):
    row = db.scalar(select(Sticker).where(Sticker.id == sticker_id, Sticker.pack_id == pack_id))
    if row is None:
        fail(404, "Sticker not found")
    return row


@router.patch("/{pack_id}/stickers")
def reorder(
    pack_id: str, payload: StickerIds, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    pack = Access(db, user.id).get(pack_id, permission="edit", lock=True)
    rows = stickers(db, pack_id)
    ids = payload.stickerIds
    if len(ids) != len(rows) or set(ids) != {row.id for row in rows}:
        fail(400, "Sticker order must contain every sticker exactly once")
    before = [row.id for row in rows]
    positions = {value: index for index, value in enumerate(ids)}
    for row in rows:
        row.position = positions[row.id]
    bump(pack)
    audit(
        db, user.id, "stickers.reorder", "pack", pack_id, {"packId": pack_id, "before": before, "after": ids}
    )
    db.flush()
    return Access(db, user.id).summary(pack, detail=True)


@router.patch("/{pack_id}/stickers/{sticker_id}")
def update_sticker(
    pack_id: str,
    sticker_id: str,
    payload: UpdateSticker,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    pack = Access(db, user.id).get(pack_id, permission="edit", lock=True)
    row = find_sticker(db, pack_id, sticker_id)
    before = data(row)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "accessibilityText":
            setattr(row, snake(key), value)
    bump(pack)
    db.flush()
    audit(
        db,
        user.id,
        "sticker.update",
        "sticker",
        row.id,
        {"packId": pack_id, "before": before, "after": data(row)},
    )
    return data(row)


@router.delete("/{pack_id}/stickers/{sticker_id}")
def delete_sticker(
    pack_id: str, sticker_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    pack = Access(db, user.id).get(pack_id, permission="edit", lock=True)
    row = find_sticker(db, pack_id, sticker_id)
    before, key = data(row), row.storage_key
    db.delete(row)
    db.flush()
    for position, remaining in enumerate(stickers(db, pack_id)):
        remaining.position = position
    bump(pack)
    audit(
        db,
        user.id,
        "sticker.delete",
        "sticker",
        sticker_id,
        {"packId": pack_id, "before": before, "after": None},
    )
    after_commit(db, lambda: get_storage().delete(key))
    return {"deleted": True}


def transfer_stickers(db, user_id, pack_id, payload, *, move):
    if pack_id == payload.targetPackId:
        fail(400, "Choose a different target pack")
    access = Access(db, user_id)
    locked = {
        key: access.get(key, permission="edit", lock=True) for key in sorted([pack_id, payload.targetPackId])
    }
    source, target = locked[pack_id], locked[payload.targetPackId]
    if source.is_animated != target.is_animated:
        fail(400, "Static and animated packs cannot be mixed")
    ids = payload.stickerIds
    rows = [row for row in stickers(db, pack_id) if row.id in ids]
    if len(set(ids)) != len(ids) or len(rows) != len(ids):
        fail(400, "Select valid, distinct stickers from the source pack")
    existing = stickers(db, target.id)
    if len(existing) + len(rows) > 30:
        fail(400, "A pack can contain at most 30 stickers")
    hashes = {row.perceptual_hash for row in existing if row.perceptual_hash}
    for row in rows:
        if row.perceptual_hash and row.perceptual_hash in hashes:
            fail(400, "This image looks like a duplicate of an existing sticker in the pack")
        hashes.add(row.perceptual_hash)
    incoming = sum(row.size_bytes for row in rows)
    quota(db, target.owner_id, 0 if move and source.owner_id == target.owner_id else incoming)
    for index, row in enumerate(rows):
        copy_sticker(db, row, target, len(existing) + index)
        if move:
            key = row.storage_key
            db.delete(row)
            after_commit(db, lambda key=key: get_storage().delete(key))
    if not target.cover_key and source.cover_key:
        target.cover_key = get_storage().new_cover_key(target.id)
        stage_file(db, target.cover_key, get_storage().read(source.cover_key))
    if move:
        db.flush()
        for index, row in enumerate(stickers(db, source.id)):
            row.position = index
        bump(source)
    bump(target)
    audit(
        db,
        user_id,
        "stickers.move" if move else "stickers.copy",
        "pack",
        target.id,
        {"packId": target.id, "sourcePackId": source.id, "stickerIds": ids},
    )
    db.flush()
    return {"copied": len(rows), "moved": len(rows) if move else 0}


@router.post("/{pack_id}/stickers/copy", status_code=201)
def copy_selected(
    pack_id: str, payload: Transfer, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return transfer_stickers(db, user.id, pack_id, payload, move=False)


@router.post("/{pack_id}/stickers/move", status_code=201)
def move_selected(
    pack_id: str, payload: Transfer, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return transfer_stickers(db, user.id, pack_id, payload, move=True)


def cover_response(db, pack, request, *, public=False):
    etag = f'"{pack.image_data_version}"'
    headers = {"ETag": etag, "Cache-Control": f"{'public' if public else 'private'}, max-age=3600, immutable"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    if not pack.cover_key:
        fail(404, "Tray icon not found")
    try:
        return Response(get_storage().read(pack.cover_key), media_type="image/webp", headers=headers)
    except FileNotFoundError:
        fail(404, "Tray icon not found")


@router.get("/{pack_id}/tray-icon")
def cover(pack_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return cover_response(db, Access(db, user.id).get(pack_id), request)


@router.get("/{pack_id}/stickers/{sticker_id}/file")
def sticker_file(
    pack_id: str, sticker_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    Access(db, user.id).get(pack_id)
    return Response(
        get_storage().read(find_sticker(db, pack_id, sticker_id).storage_key),
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/{pack_id}/contents")
def pack_contents(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return contents(db, Access(db, user.id).get(pack_id))


@router.get("/{pack_id}/manifest")
def pack_manifest(
    pack_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    result = manifest(db, Access(db, user.id).get(pack_id))
    etag = f'"{result["contentHash"]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(json.dumps(result), media_type="application/json", headers={"ETag": etag})


@router.get("/{pack_id}/export")
def export_pack(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    path, checksum = build_zip(db, Access(db, user.id).get(pack_id))
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"sticker-pack-{pack_id}.zip",
        headers={"ETag": f'"{checksum}"'},
    )


@router.post("/{pack_id}/export/jobs", status_code=202)
def queue_export(pack_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from .jobs import enqueue

    pack = Access(db, user.id).get(pack_id)
    contents(db, pack)
    return enqueue(db, user.id, "export", {}, pack_id=pack_id)


@public_router.get("")
def discover(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Pack).where(Pack.is_public.is_(True)).order_by(Pack.updated_at.desc())))
    counts = pack_counts(db, [row.id for row in rows])
    return [public_summary(db, row, counts=counts.get(row.id, (0, 0))) for row in rows]


@public_router.get("/{pack_id}")
def public_detail(pack_id: str, db: Session = Depends(get_db)):
    return public_summary(db, public_pack(db, pack_id), detail=True)


@public_router.get("/{pack_id}/tray-icon")
def public_cover(pack_id: str, request: Request, db: Session = Depends(get_db)):
    return cover_response(db, public_pack(db, pack_id), request, public=True)


@public_router.get("/{pack_id}/stickers/{sticker_id}/file")
def public_sticker(pack_id: str, sticker_id: str, db: Session = Depends(get_db)):
    pack = public_pack(db, pack_id)
    sticker = find_sticker(db, pack_id, sticker_id)
    if pack.requires_approval and sticker.review_status != "APPROVED":
        fail(404, "Public sticker not found")
    return Response(
        get_storage().read(sticker.storage_key),
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=300"},
    )


@public_router.get("/{pack_id}/export")
def public_export(pack_id: str, db: Session = Depends(get_db)):
    pack = public_pack(db, pack_id)
    if not 3 <= len(export_stickers(db, pack)) <= 30:
        fail(404, "Public pack is not exportable yet")
    path, checksum = build_zip(db, pack)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"sticker-pack-{pack_id}.zip",
        headers={"ETag": f'"{checksum}"'},
    )


@sync_router.get("/packs")
def sync(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from .models import now

    access = Access(db, user.id)
    rows = db.scalars(access.visible().order_by(Pack.updated_at.desc(), Pack.name))
    result = []
    for pack in rows:
        exported = export_stickers(db, pack)
        summary = access.summary(pack)
        summary["stickerCount"] = len(exported)
        summary["isOwner"] = pack.owner_id == user.id
        summary["contentHash"] = content_hash(pack, exported, tray=False)
        summary["syncHash"] = hashlib.sha256(
            f"{pack.id}:{pack.image_data_version}:{len(exported)}:{iso(pack.updated_at)}:{str(pack.is_animated).lower()}".encode()
        ).hexdigest()
        summary["exportPath"] = f"/packs/{pack.id}/export"
        summary["trayIconPath"] = f"/packs/{pack.id}/tray-icon"
        result.append(summary)
    return {"serverTime": iso(now()), "packs": result}
