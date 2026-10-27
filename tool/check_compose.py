"""Validate supported Compose overlays without touching running services."""

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VARIANTS = {
    "base": [],
    "development": ["dev"],
    "ai": ["ai"],
    "development + ai": ["dev", "ai"],
    "production": ["production"],
    "published images": ["production", "ghcr"],
}


def main():
    environment = {
        **os.environ,
        "JWT_SECRET": "compose-validation-only-not-a-deployment-secret",
        "CORS_ORIGIN": "https://stickers.example.test",
        "STICKER_FOUNDRY_VERSION": "2.0.0",
    }
    for name, overlays in VARIANTS.items():
        print(f"Validating {name} Compose configuration...", flush=True)
        files = [
            "docker-compose.yml",
            *[f"docker-compose.{overlay}.yml" for overlay in overlays],
        ]
        arguments = [argument for file in files for argument in ("-f", file)]
        subprocess.run(
            ["docker", "compose", *arguments, "config", "--quiet"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
    print("All Compose configurations are valid.")


if __name__ == "__main__":
    main()
