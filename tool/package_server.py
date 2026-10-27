"""Package source inputs for the Docker server without local caches or credentials."""

import argparse
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OMIT = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "build",
    ".dart_tool",
    "dist",
}


def package(target: Path):
    entries = [
        ROOT / name
        for name in [
            "README.md",
            "LICENSE",
            ".dockerignore",
            ".env.example",
            ".env.production.example",
            "docker-compose.yml",
            "docker-compose.production.yml",
            "docker-compose.ai.yml",
            "docker-compose.ghcr.yml",
            "apps/backend/pyproject.toml",
            "apps/backend/uv.lock",
            "apps/backend/Dockerfile",
            "apps/backend/foundry",
            "apps/client/Dockerfile",
            "apps/client/nginx.conf",
            "apps/client/pubspec.yaml",
            "apps/client/pubspec.lock",
            "apps/client/lib",
            "apps/client/web",
            "apps/client/assets",
            "assets",
            "docs",
        ]
    ]
    target.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, "w:gz") as archive:
        for entry in entries:
            if not entry.exists():
                raise FileNotFoundError(entry.relative_to(ROOT))
            for path in [entry, *sorted(entry.rglob("*"))] if entry.is_dir() else [entry]:
                relative = path.relative_to(ROOT)
                if path.is_symlink() or path.is_dir() or any(part in OMIT for part in relative.parts):
                    continue
                if path.name.startswith(".env") and path.name not in {
                    ".env.example",
                    ".env.production.example",
                }:
                    continue
                if path.suffix in {".pyc", ".log", ".keystore", ".jks"}:
                    continue
                archive.add(path, arcname=relative.as_posix(), recursive=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "dist/sticker-foundry-server-package.tar.gz",
    )
    arguments = parser.parse_args()
    package(arguments.output)
    print(f"Created {arguments.output.name}")
