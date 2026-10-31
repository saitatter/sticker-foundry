import base64
import hashlib
import io

import pytest
from foundry.config import get_settings
from PIL import Image

from .test_packs import image_bytes


@pytest.mark.parametrize("animated", [False, True])
def test_import_inspection_validates_media_without_creating_packs(client, owner, animated):
    _, headers = owner
    content = image_bytes(animated=animated)
    response = client.post(
        "/api/imports/inspect", headers=headers, files={"file": ("sticker.webp", content, "image/webp")}
    )
    assert response.status_code == 200, response.text
    info = response.json()
    assert info["animated"] is animated
    assert info["frames"] == (3 if animated else 1)
    assert (info["width"], info["height"]) == (64, 48)
    assert info["sha256"] == hashlib.sha256(content).hexdigest()
    with Image.open(io.BytesIO(base64.b64decode(info["thumbnail"]))) as thumbnail:
        assert thumbnail.format == "PNG" and max(thumbnail.size) <= 128
    assert client.get("/api/packs", headers=headers).json() == []


def test_inspection_requires_auth_and_rejects_unsafe_images(client, owner, monkeypatch):
    _, headers = owner
    url = "/api/imports/inspect"
    assert client.post(url, files={"file": ("a.png", image_bytes(), "image/png")}).status_code == 401
    for content, mime in [(b"broken", "image/webp"), (b"text", "text/plain")]:
        assert (
            client.post(url, headers=headers, files={"file": ("bad.webp", content, mime)}).status_code == 400
        )
    oversized = b"x" * (10 * 1024 * 1024 + 1)
    assert (
        client.post(url, headers=headers, files={"file": ("big.png", oversized, "image/png")}).status_code
        == 413
    )
    monkeypatch.setenv("UPLOAD_MAX_PIXELS", "10")
    get_settings.cache_clear()
    response = client.post(url, headers=headers, files={"file": ("a.png", image_bytes(), "image/png")})
    assert response.status_code == 400 and "too large" in response.json()["message"]
