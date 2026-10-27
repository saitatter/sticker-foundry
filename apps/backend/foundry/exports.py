import hashlib
import json
import os
import zipfile
from uuid import uuid4

from .access import stickers
from .common import fail
from .config import get_settings
from .storage import get_storage


def export_stickers(db, pack):
    return [
        row for row in stickers(db, pack.id) if not pack.requires_approval or row.review_status == "APPROVED"
    ]


def clean_emojis(values):
    return [value for value in (values or []) if value][:3] or ["\U0001f600"]


def content_hash(pack, rows, *, tray=True):
    digest = hashlib.sha256(f"{pack.id}:{pack.image_data_version}:{str(pack.is_animated).lower()}".encode())
    if tray:
        storage = get_storage()
        try:
            if not pack.cover_key:
                raise FileNotFoundError("No cover")
            digest.update(storage.read(pack.cover_key))
        except FileNotFoundError:
            digest.update(b"missing-tray-icon")
    for row in rows:
        digest.update(f"{row.file_name}:{row.sha256}".encode())
    return digest.hexdigest()


def contents(db, pack):
    rows = export_stickers(db, pack)
    if not 3 <= len(rows) <= 30:
        fail(400, "A WhatsApp pack needs between 3 and 30 eligible stickers")
    return {
        "android_play_store_link": "",
        "ios_app_store_link": "",
        "sticker_packs": [
            {
                "identifier": pack.id[:128],
                "name": pack.name,
                "publisher": pack.publisher,
                "tray_image_file": "tray_icon.webp",
                "image_data_version": pack.image_data_version,
                "avoid_cache": False,
                "animated_sticker_pack": pack.is_animated,
                "publisher_email": "",
                "publisher_website": "",
                "privacy_policy_website": "",
                "license_agreement_website": "",
                "stickers": [
                    {
                        "image_file": row.file_name,
                        "emojis": clean_emojis(row.emojis),
                        **({"accessibility_text": row.accessibility_text} if row.accessibility_text else {}),
                    }
                    for row in rows
                ],
            }
        ],
    }


def manifest(db, pack):
    rows = export_stickers(db, pack)
    return {
        "id": pack.id,
        "name": pack.name,
        "publisher": pack.publisher,
        "requiresApproval": pack.requires_approval,
        "isAnimated": pack.is_animated,
        "imageDataVersion": pack.image_data_version,
        "stickerCount": len(rows),
        "canExport": 3 <= len(rows) <= 30,
        "contentHash": content_hash(pack, rows),
        "exportPath": f"/packs/{pack.id}/export",
        "trayIconPath": f"/packs/{pack.id}/tray-icon",
        "stickers": [
            {
                "fileName": row.file_name,
                "emojis": clean_emojis(row.emojis),
                "accessibilityText": row.accessibility_text,
                "sha256": row.sha256,
                "sizeBytes": row.size_bytes,
            }
            for row in rows
        ],
    }


def build_zip(db, pack):
    document = contents(db, pack)
    rows = export_stickers(db, pack)
    checksum = content_hash(pack, rows)
    directory = get_settings().export_directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{pack.id}-{checksum}.zip"
    if not target.is_relative_to(directory):
        raise ValueError("Unsafe export path")
    if target.is_file():
        return target, checksum
    temporary = target.with_suffix(f".{uuid4()}.tmp")
    storage = get_storage()
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("contents.json", json.dumps(document, ensure_ascii=False, indent=2))
            if not pack.cover_key:
                fail(400, "Set a tray icon before exporting")
            archive.writestr("tray_icon.webp", storage.read(pack.cover_key))
            for row in rows:
                if "/" in row.file_name or "\\" in row.file_name or row.file_name in {".", ".."}:
                    raise ValueError("Unsafe sticker filename")
                archive.writestr(row.file_name, storage.read(row.storage_key))
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return target, checksum
