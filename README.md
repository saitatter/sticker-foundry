# Sticker Foundry

Self-hosted sticker management with a shared Flutter interface and a Python backend. Create static and animated packs, edit directly on the image, collaborate with your team and keep packs available offline. Android imports packs into WhatsApp through its native sticker provider.

## What you can do

- **Create and edit:** upload PNG/GIF media individually or in batches, crop and rotate, add text, adjust effects and edit sticker metadata.
- **Import existing sticker files:** use the folder-import icon in your library to preview WebP and other images, skip identical files and create separate static/animated packs. On Android, choose an accessible sticker-media folder or copy files to Downloads; WhatsApp does not expose its entire collection to other apps.
- **Organize your library:** search, filter, rename and clone packs; copy or move stickers between them.
- **Arrange a pack:** keep its tray icon centered above a numbered grid, add images from empty slots and hold or drag stickers to reorder them. The phone layout uses three columns; desktop adapts to the available width.
- **Collaborate safely:** use teams, invitations, roles, comments, review approvals and public sharing.
- **Export and take offline:** validate pack readiness, download ZIP archives, cache packs per server/account and import static or animated packs into WhatsApp on Android.
- **Manage your instance:** configure registration, quotas and processing, review activity and audit entries, reset passwords and revoke individual or all sessions.

## Install the app

Download a build from [GitHub Releases](https://github.com/saitatter/sticker-foundry/releases/latest), then connect it to your server's API URL, for example `https://stickers.example.com/api/`.

| Platform | Release asset |
| --- | --- |
| Android | `sticker-foundry-android.apk`, or the explicitly named `sticker-foundry-android-debug.apk` when release signing is unavailable |
| Windows | `sticker-foundry-windows.zip` |
| macOS | `sticker-foundry-macos.zip` |
| Linux | `sticker-foundry-linux.tar.gz` |
| Web | Served by the Docker web service; `sticker-foundry-web.tar.gz` is also available |
| Server | `sticker-foundry-server-package.tar.gz` includes the source and Docker deployment files |

Flutter also includes an iOS target, but this release does not distribute a prebuilt iOS app. WhatsApp import is Android-only. AI background removal requires the optional service; threshold removal works without a model.

## Compatibility

**Version 2 is a fresh installation baseline.** The Python backend and Flutter client do not support databases or clients from earlier major versions. Use a new database and separate media storage; retain the old installation and its backups independently. There is no automatic data upgrade from version 1. See the [deployment guide](docs/DEPLOY_SERVER.md) before switching a running instance.

## Run the server

Install Docker Compose, copy `.env.example` to `.env`, set unique PostgreSQL and JWT secrets, then run:

```sh
docker compose up -d --build
```

Open http://localhost:8080. The first registered account becomes administrator. Start with an empty database; initialization refuses an unrelated schema without changing it.

FastAPI, PostgreSQL, Redis and separate Celery workers handle media, exports and email. Optional AI removal uses `docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build`. Threshold removal needs no model. Project tools and browser tests use Python and Dart; no separate Node/npm installation is required.

For production, configure HTTPS, SMTP and the public URLs as described in [Server deployment](docs/DEPLOY_SERVER.md). Published images are `ghcr.io/saitatter/sticker-foundry-backend`, `sticker-foundry-backend-ai` and `sticker-foundry-web`; set `STICKER_FOUNDRY_VERSION` to an exact release when using `docker-compose.ghcr.yml`.

## Develop and verify

Use Python 3.13 with uv and Flutter 3.47.7:

```sh
uv sync --project apps/backend --locked
cd apps/client
flutter pub get
cd ../..
dart run tool/ci_check.dart
```

Add `--integration` to build an isolated Docker stack, test actual PostgreSQL/Redis/workers, and run Chromium, Firefox and WebKit acceptance. It removes only its own test volumes.

Android builds require JDK 17 and the Android SDK. The JDK compiles the app and WhatsApp bridge; it is not a backend dependency.

For repeatable physical-device checks, install the debug APK and configure an isolated QA server, then use:

```sh
uv run --project apps/backend python -m tool.phone_smoke --serial SERIAL --video --whatsapp
```

The suite exercises the library, editor, exports, offline use and both WhatsApp pack types. Credentials, recordings and reports stay in ignored `test-results/`. Setup, safety checks and coverage limits are documented in [Android automation](docs/testing.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Development and device testing](docs/development.md)
- [Server deployment](docs/DEPLOY_SERVER.md)
- [Reverse proxy](docs/REVERSE_PROXY.md)
- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [WhatsApp validation](docs/WHATSAPP_VALIDATION.md)
- [Test recording and Android automation](docs/testing.md)
- [Android signing](docs/ANDROID_SIGNING.md)
- [Versioning and changelogs](docs/versioning-policy.md)
- [Changelog](CHANGELOG.md)

Original logo: `assets/brand/sticker-foundry-icon.png`. Check icons with `dart run tool/sync_brand.dart --check` from `apps/client`; omit `--check` to regenerate them.

## Support

If Sticker Foundry is useful to you, you can support ongoing development on [Ko-fi](https://ko-fi.com/saitatter).
