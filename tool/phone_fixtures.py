"""Generate synthetic media for USB phone QA without accessing personal photos."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageSequence


def generate(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for index, color in enumerate(("#e05263", "#187d92", "#ecae30"), 1):
        image = Image.new("RGBA", (512, 512))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((60, 60, 452, 452), radius=90, fill=color)
        draw.ellipse((150, 150, 200, 200), fill="white")
        draw.ellipse((312, 150, 362, 200), fill="white")
        draw.arc((165, 210, 347, 360), 0, 180, fill="white", width=18)
        image.save(output / f"foundry-qa-{index}.png")
        frames = [image.rotate(angle).resize((256, 256)) for angle in (0, 12, 24, 12)]
        frames[0].save(
            output / f"foundry-qa-animated-{index}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=120,
            loop=0,
            disposal=2,
        )


def generate_import(output):
    """A mixed WebP folder, including a duplicate, invalid image and ignored text."""
    import tempfile

    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="foundry-import-fixtures-") as scratch:
        generate(scratch)
        for index in range(1, 4):
            with Image.open(Path(scratch) / f"foundry-qa-{index}.png") as image:
                image.save(output / f"static-{index}.webp", format="WEBP", lossless=True)
            with Image.open(Path(scratch) / f"foundry-qa-animated-{index}.gif") as animation:
                frames = [frame.convert("RGBA") for frame in ImageSequence.Iterator(animation)]
                frames[0].save(
                    output / f"animated-{index}.webp",
                    format="WEBP",
                    save_all=True,
                    append_images=frames[1:],
                    duration=120,
                    loop=0,
                    lossless=True,
                )
    (output / "duplicate.webp").write_bytes((output / "static-1.webp").read_bytes())
    (output / "broken.webp").write_bytes(b"not an image")
    (output / "ignored.txt").write_text("Not a sticker", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("test-results/device/fixtures"))
    parser.add_argument("--import-folder", action="store_true")
    args = parser.parse_args()
    (generate_import if args.import_folder else generate)(args.output)
    print(f"Generated synthetic media in {args.output}")
