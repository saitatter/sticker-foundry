"""Verify that local data stays ignored and source inputs remain versioned."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = {
    ".env": True,
    ".env.production": True,
    "apps/client/.env.local": True,
    ".env.example": False,
    ".env.production.example": False,
    "apps/client/.dart_tool/package_config.json": True,
    "apps/client/build/app/outputs/flutter-apk/app-debug.apk": True,
    "apps/client/android/local.properties": True,
    "apps/client/android/.gradle/cache.bin": True,
    "apps/client/android/app/.cxx/cache.bin": True,
    "apps/backend/.venv/pyvenv.cfg": True,
    "apps/backend/.ruff_cache/cache.bin": True,
    "apps/backend/foundry/__pycache__/main.pyc": True,
    "apps/backend/uv.lock": False,
    "apps/backend/data/packs/private.webp": True,
    "test-results/phone/session.json": True,
    "test-results/playwright/trace.zip": True,
    "release.keystore": True,
    "release.jks": True,
    "apps/client/android/key.properties": True,
    "apps/client/pubspec.lock": False,
    "apps/client/android/gradlew": False,
    "apps/client/android/gradle/wrapper/gradle-wrapper.jar": False,
    "assets/brand/sticker-foundry-icon.png": False,
    "apps/client/assets/brand/sticker-foundry-icon.png": False,
}


def main():
    for path, ignored in CASES.items():
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "--", path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode not in {0, 1}:
            raise RuntimeError(result.stderr)
        if (result.returncode == 0) != ignored:
            raise AssertionError(f"{path}: expected {'ignored' if ignored else 'version controlled'}")
    print(f"{len(CASES)} repository ignore rules verified.")


if __name__ == "__main__":
    main()
