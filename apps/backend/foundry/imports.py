"""Read-only media inspection before a user confirms a folder import."""

import base64
import hashlib
import io

from fastapi import APIRouter, Depends, File, UploadFile
from PIL import Image

from .auth import current_user
from .images import open_image
from .models import User
from .packs import upload_bytes

router = APIRouter(prefix="/imports", tags=["Imports"])


@router.post("/inspect")
def inspect_image(file: UploadFile = File(...), user: User = Depends(current_user)):
    content = upload_bytes(file)
    with open_image(content) as image:
        width, height = image.size
        frames = getattr(image, "n_frames", 1)
        image.seek(0)
        preview = image.convert("RGBA")
        preview.thumbnail((128, 128), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        preview.save(output, format="PNG")
    return {
        "sha256": hashlib.sha256(content).hexdigest(),
        "width": width,
        "height": height,
        "frames": frames,
        "animated": frames > 1,
        "thumbnail": base64.b64encode(output.getvalue()).decode("ascii"),
    }
