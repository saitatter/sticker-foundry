"""Generate synthetic media for USB phone QA without accessing personal photos."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("test-results/device/fixtures"))
    args = parser.parse_args()
    generate(args.output)
    print(f"Generated three PNGs and three animated GIFs in {args.output}")
