import io
import subprocess
from pathlib import Path

import pytest
from fastapi import HTTPException
from PIL import Image

from foundry.config import get_settings
from foundry.db import transaction
from foundry.images import background_cutout, process_image
from foundry.media import stage_file
from foundry.schemas import MediaOptions
from foundry.storage import get_storage

from .test_packs import image_bytes


def test_threshold_cutout_keeps_colored_subject_and_removes_white(client):
    raw = image_bytes()
    output = background_cutout(
        raw, MediaOptions(backgroundRemovalMode="threshold", backgroundRemovalFeather=0)
    )
    image = Image.open(io.BytesIO(output)).convert("RGBA")
    assert image.getpixel((0, 0))[3] == 0
    assert image.getpixel((15, 15))[3] == 255


@pytest.mark.parametrize("failure", ["timeout", "invalid-output"])
def test_ai_failure_falls_back_to_threshold(client, monkeypatch, failure):
    get_settings().background_removal_command = "provider {input} {output}"

    def provider(args, **kwargs):
        if failure == "timeout":
            raise subprocess.TimeoutExpired(args, kwargs["timeout"])
        Path(args[-1]).write_bytes(b"invalid image")

    monkeypatch.setattr(subprocess, "run", provider)
    output = background_cutout(image_bytes(), MediaOptions(backgroundRemovalMode="ai"))
    with Image.open(io.BytesIO(output)) as image:
        assert image.convert("RGBA").getpixel((0, 0))[3] == 0


def test_static_tray_and_animation_limits(client):
    static = process_image(image_bytes())
    assert static.width == static.height == 512
    assert static.size <= 100 * 1024
    assert len(static.perceptual_hash) == 22
    tray = process_image(image_bytes(), tray=True)
    assert tray.width == tray.height == 96
    animated = image_bytes(animated=True)
    with pytest.raises(HTTPException, match="Static packs"):
        process_image(animated)
    with pytest.raises(HTTPException, match="static images"):
        process_image(animated, tray=True)
    with pytest.raises(HTTPException, match="animated sticker uploads"):
        process_image(image_bytes(), animated=True)
    result = process_image(
        animated,
        animated=True,
        options=MediaOptions(
            animatedTrimStart=0.1, animatedTrimEnd=0.6, animatedFrameRate=20, animatedQuality=65
        ),
    )
    with Image.open(io.BytesIO(result.content)) as image:
        assert image.n_frames >= 2
        durations = []
        for i in range(image.n_frames):
            image.seek(i)
            image.load()
            durations.append(image.info["duration"])
        assert sum(durations) == 500


def test_upload_bounds_are_checked_before_decoding_frames(client):
    settings = get_settings()
    settings.upload_max_pixels = 100
    with pytest.raises(HTTPException, match="too large"):
        process_image(image_bytes())
    settings.upload_max_pixels = 25_000_000
    settings.upload_max_animated_frames = 2
    with pytest.raises(HTTPException, match="too many frames"):
        process_image(image_bytes(animated=True), animated=True)


def test_storage_keys_cannot_escape_and_staged_files_roll_back(client):
    storage = get_storage()
    for key in ["../secret", "/absolute", "C:/outside", "packs/../secret", "packs\\secret", "packs/./secret"]:
        with pytest.raises(ValueError):
            storage.write(key, b"bad")
    storage.write("packs/p/stickers/test.webp", b"before")
    with pytest.raises(RuntimeError):
        with transaction() as db:
            stage_file(db, "packs/p/stickers/staged.webp", b"staged")
            raise RuntimeError("Database operation failed")
    assert not storage.exists("packs/p/stickers/staged.webp")
    assert storage.read("packs/p/stickers/test.webp") == b"before"


def test_storage_rejects_symlinks_outside_its_root(client, tmp_path):
    storage = get_storage()
    storage.root.mkdir(parents=True, exist_ok=True)
    external = tmp_path / "outside"
    external.mkdir()
    link = storage.root / "escape"
    try:
        link.symlink_to(external, target_is_directory=True)
    except OSError:
        pytest.skip("This host does not allow creating directory symlinks")
    with pytest.raises(ValueError):
        storage.write("escape/file", b"bad")
    assert not (external / "file").exists()
