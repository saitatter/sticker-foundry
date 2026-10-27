import bisect
import hashlib
import io
import logging
import shlex
import subprocess
import tempfile
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError
from scipy import ndimage

from .common import fail
from .config import get_settings
from .schemas import MediaOptions

log = logging.getLogger(__name__)


@dataclass
class ProcessedImage:
    content: bytes
    width: int
    height: int
    perceptual_hash: str

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()

    @property
    def size(self) -> int:
        return len(self.content)


def open_image(content: bytes) -> Image.Image:
    settings = get_settings()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(content))
        if image.format not in {"PNG", "JPEG", "WEBP", "GIF", "AVIF", "TIFF"}:
            fail(400, f"Unsupported image format: {image.format}")
        pixels = image.width * image.height
        frames = getattr(image, "n_frames", 1)
        if pixels > settings.upload_max_pixels:
            fail(
                400,
                f"Image is too large: {image.width}x{image.height} exceeds {settings.upload_max_pixels} pixels",
            )
        if frames > settings.upload_max_animated_frames:
            fail(400, f"Animated image has too many frames: {frames}")
        if pixels * frames > settings.upload_max_total_pixels:
            fail(400, f"Image has too many total pixels across frames: {pixels * frames}")
        return image
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        fail(400, f"Upload is not a valid or safely sized image file: {type(error).__name__}")


def background_cutout(content: bytes, options: MediaOptions) -> bytes:
    if options.backgroundRemovalMode == "none":
        return content
    settings = get_settings()
    if options.backgroundRemovalMode == "ai" and settings.background_removal_command:
        try:
            with tempfile.TemporaryDirectory(prefix="sticker-foundry-bg-") as directory:
                source, target = Path(directory) / "input.png", Path(directory) / "output.png"
                source.write_bytes(content)
                # Parse arguments before expansion; paths containing spaces remain one argument.
                args = [
                    arg.replace("{input}", str(source)).replace("{output}", str(target))
                    for arg in shlex.split(settings.background_removal_command)
                ]
                subprocess.run(
                    args,
                    cwd=directory,
                    check=True,
                    capture_output=True,
                    timeout=settings.background_removal_timeout_ms / 1000,
                )
                result = target.read_bytes()
                with open_image(result) as checked:
                    checked.load()
                return result
        except (OSError, subprocess.SubprocessError, HTTPException) as error:
            log.warning("AI background removal failed; using threshold: %s", type(error).__name__)
    with open_image(content) as source:
        pixels = np.array(ImageOps.exif_transpose(source).convert("RGBA"))
    rgb = pixels[:, :, :3].astype(np.int16)
    neutral = np.ptp(rgb, axis=2) <= 28
    brightness = rgb.mean(axis=2, dtype=np.float32)
    if options.backgroundRemovalFeather:
        factor = np.clip(
            (options.backgroundRemovalThreshold - brightness) / options.backgroundRemovalFeather, 0, 1
        )
    else:
        factor = (brightness < options.backgroundRemovalThreshold).astype(np.float32)
    pixels[:, :, 3] = np.where(neutral, np.rint(pixels[:, :, 3] * factor), pixels[:, :, 3]).astype(np.uint8)
    del rgb, neutral, brightness, factor
    if options.backgroundRemovalCleanupSpeckles:
        labels, _ = ndimage.label(pixels[:, :, 3] > 12)
        areas = np.bincount(labels.ravel())
        remove = areas <= options.backgroundRemovalSpeckleSize
        remove[0] = False
        pixels[:, :, 3][remove[labels]] = 0
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format="PNG")
    return output.getvalue()


def fit(image: Image.Image, side: int) -> Image.Image:
    frame = ImageOps.exif_transpose(image).convert("RGBA")
    resized = ImageOps.contain(frame, (side, side), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (side, side))
    result.paste(resized, ((side - resized.width) // 2, (side - resized.height) // 2))
    return result


def perceptual_hash(image: Image.Image) -> str:
    rgba = image.convert("RGBA")
    white = Image.new("RGBA", rgba.size, "white")
    white.alpha_composite(rgba)
    pixels = np.asarray(white.convert("RGB").resize((8, 8), Image.Resampling.LANCZOS)).reshape(-1, 3).tolist()
    gray = [int(r * 0.299 + g * 0.587 + b * 0.114 + 0.5) for r, g, b in pixels]
    average = sum(gray) / 64
    binary = "".join("1" if value >= average else "0" for value in gray)
    colors = [int(sum(pixel[channel] for pixel in pixels) / 64 + 0.5) for channel in range(3)]
    return f"{int(binary, 2):016x}" + "".join(f"{value:02x}" for value in colors)


def qualities(preferred: int | None) -> list[int]:
    defaults = [90, 80, 70, 60, 50, 40, 32, 25]
    if preferred is None:
        return defaults
    return sorted(
        {max(25, preferred - i * 10) for i in range(7)} | {q for q in defaults if q <= preferred},
        reverse=True,
    )


def sample_animation(delays: list[int], options: MediaOptions) -> list[tuple[int, int]]:
    ends = np.cumsum(delays).tolist()
    total = ends[-1]
    start = min((options.animatedTrimStart or 0) * 1000, max(0, total - 1))
    end = min((options.animatedTrimEnd * 1000 if options.animatedTrimEnd else total), total)
    if end <= start:
        fail(400, "Animated trim end must be after trim start")
    if end - start > 10_000:
        fail(400, "Animated sticker duration must be at most 10000ms")
    fps = options.animatedFrameRate or min(30, max(1, round(1000 / (total / len(delays)))))
    step = 1000 / fps
    samples = []
    i = 0
    while start + i * step < end:
        at = start + i * step
        index = min(bisect.bisect_right(ends, at), len(delays) - 1)
        duration = max(1, round(min(end, at + step) - start) - round(at - start))
        if samples and samples[-1][0] == index:
            samples[-1] = (index, samples[-1][1] + duration)
        else:
            samples.append((index, duration))
        i += 1
    if len(samples) < 2 or any(duration < 8 for _, duration in samples):
        fail(400, "Animated edit must keep at least two frames of at least 8ms")
    return samples


def process_image(
    content: bytes, *, animated=False, tray=False, auto_tray=False, options=None
) -> ProcessedImage:
    options = options or MediaOptions(backgroundRemovalMode="none")
    source = open_image(content)
    frames, delays = [], []
    try:
        count = getattr(source, "n_frames", 1)
        if tray and count > 1 and not auto_tray:
            fail(400, "Tray icons must be static images")
        if not tray and animated and count < 2:
            fail(400, "Animated packs require animated sticker uploads")
        if not tray and not animated and count > 1:
            fail(400, "Static packs do not accept animated stickers")
        edited = animated and any(
            value is not None
            for value in (options.animatedTrimStart, options.animatedTrimEnd, options.animatedFrameRate)
        )
        if edited and source.width * source.height * count > get_settings().upload_max_animated_edit_pixels:
            fail(400, "Animated frame editing exceeds the configured editable pixel budget")
        for index in range(count if animated and not tray else 1):
            source.seek(index)
            frames.append(fit(source.copy(), 96 if tray else 512))
            delays.append(int(source.info.get("duration", 100) or 100))
        if animated and not tray:
            if edited:
                sampled = sample_animation(delays, options)
                frames, delays = [frames[i] for i, _ in sampled], [duration for _, duration in sampled]
            if sum(delays) > 10_000 or any(delay < 8 for delay in delays):
                fail(400, "Animated frames must be at least 8ms and duration at most 10000ms")
        limit = 50 * 1024 if tray else (500 if animated else 100) * 1024
        preferred = options.animatedQuality if animated else options.staticQuality
        for quality in qualities(preferred):
            output = io.BytesIO()
            frames[0].save(
                output,
                format="WEBP",
                quality=quality,
                method=6,
                save_all=animated and not tray,
                append_images=frames[1:] if animated and not tray else [],
                duration=delays,
                loop=0,
            )
            result = output.getvalue()
            if len(result) <= limit:
                if animated and not tray:
                    with Image.open(io.BytesIO(result)) as checked:
                        if getattr(checked, "n_frames", 1) < 2:
                            fail(400, "Animated edit must retain at least two distinct frames")
                return ProcessedImage(result, frames[0].width, frames[0].height, perceptual_hash(frames[0]))
        fail(400, f"Image cannot be compressed below {limit} bytes without excessive quality loss")
    except (OSError, ValueError) as error:
        fail(400, f"Image could not be processed: {error}")
    finally:
        source.close()
        for frame in frames:
            frame.close()
