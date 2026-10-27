from uuid import uuid4

from sqlalchemy import select

from .access import Access, bump, check_version, duplicate, quota, stickers
from .common import audit, data, fail
from .db import after_commit, after_rollback
from .images import background_cutout, open_image, process_image
from .models import Sticker
from .schemas import MediaOptions
from .storage import get_storage


def stage_file(db, key, content):
    storage = get_storage()
    storage.write(key, content)
    after_rollback(db, lambda: storage.delete(key))


def apply_upload(
    db,
    user_id: str,
    pack_id: str,
    content: bytes,
    options: MediaOptions,
    *,
    replace_id=None,
    tray=False,
    version=None,
):
    access = Access(db, user_id)
    pack = access.get(pack_id, permission="edit", lock=True)
    check_version(pack, version)
    storage = get_storage()
    if tray:
        result = process_image(content, tray=True)
        old = pack.cover_key
        key = storage.new_cover_key(pack_id)
        stage_file(db, key, result.content)
        pack.cover_key = key
        bump(pack)
        if old:
            after_commit(db, lambda: storage.delete(old))
        audit(db, user_id, "pack.tray.update", "pack", pack_id, {"packId": pack_id})
        db.flush()
        return access.summary(pack, detail=True)
    previous = None
    if replace_id:
        previous = db.scalar(select(Sticker).where(Sticker.id == replace_id, Sticker.pack_id == pack_id))
        if previous is None:
            fail(404, "Sticker not found")
    elif len(stickers(db, pack_id)) >= 30:
        fail(400, "A pack can contain at most 30 stickers")
    with open_image(content) as original:
        count = getattr(original, "n_frames", 1)
        if not pack.is_animated and count > 1:
            fail(400, "Static packs do not accept animated stickers")
        if pack.is_animated and count < 2:
            fail(400, "Animated packs require animated sticker uploads")
    prepared = content if pack.is_animated else background_cutout(content, options)
    result = process_image(prepared, animated=pack.is_animated, options=options)
    duplicate(db, pack_id, result.perceptual_hash, ignore=replace_id)
    quota(db, pack.owner_id, max(0, result.size - (previous.size_bytes if previous else 0)))
    filename = f"{uuid4()}.webp"
    key = storage.pack_key(pack_id, filename)
    stage_file(db, key, result.content)
    if previous:
        before = data(previous)
        old_key = previous.storage_key
        sticker = previous
        after_commit(db, lambda: storage.delete(old_key))
    else:
        before = None
        sticker = Sticker(
            pack_id=pack_id,
            file_name=filename,
            position=len(stickers(db, pack_id)),
            emojis=options.emojis or ["\U0001f600"],
        )
        db.add(sticker)
    sticker.storage_key = key
    sticker.mime_type = "image/webp"
    sticker.width, sticker.height = result.width, result.height
    sticker.size_bytes, sticker.sha256 = result.size, result.sha256
    sticker.perceptual_hash = result.perceptual_hash
    if options.emojis is not None:
        sticker.emojis = [value for value in options.emojis if value][:3]
    if options.accessibilityText is not None:
        sticker.accessibility_text = options.accessibilityText
    if not pack.cover_key:
        tray_result = process_image(prepared, tray=True, auto_tray=True)
        cover = storage.new_cover_key(pack_id)
        stage_file(db, cover, tray_result.content)
        pack.cover_key = cover
    bump(pack)
    db.flush()
    audit(
        db,
        user_id,
        "sticker.replace" if previous else "sticker.upload",
        "sticker",
        sticker.id,
        {"packId": pack_id, "before": before, "after": data(sticker)},
    )
    return data(sticker)
