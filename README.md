# Sticker Foundry

Self-hosted sticker management with Flutter for Android, iOS, Windows, macOS, Linux and web, and a Python API. Edit stickers directly on the image, collaborate on packs and keep offline downloads. Android integrates with WhatsApp through its native sticker provider.

## Run the server

Install Docker Compose, copy `.env.example` to `.env`, set unique PostgreSQL and JWT secrets, then run:

```sh
docker compose up -d --build
```

Open http://localhost:8080. The first registered account becomes administrator. Start with an empty database; initialization refuses an unrelated schema without changing it. The next major release requires a fresh installation.

FastAPI, PostgreSQL, Redis and separate Celery workers handle media, exports and email. Optional AI removal uses `docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build`. Threshold removal needs no model. Node.js is used only for development tools.

## Develop and verify

Use Python 3.13 with uv, Flutter 3.47.7 and Node.js 22 for browser tools:

```sh
uv sync --project apps/backend --locked
npm ci
cd apps/client
flutter pub get
cd ../..
dart run tool/ci_check.dart
```

Add `--integration` to build an isolated Docker stack, test actual PostgreSQL/Redis/workers, and run Chromium, Firefox and WebKit acceptance. It removes only its own test volumes.

Android builds require JDK 17 and the Android SDK. The JDK compiles the app and WhatsApp bridge; it is not a backend dependency.

## Documentation

- [Architecture](docs/architecture.md)
- [Development and device testing](docs/development.md)
- [Server deployment](docs/DEPLOY_SERVER.md)
- [Reverse proxy](docs/REVERSE_PROXY.md)
- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [WhatsApp validation](docs/WHATSAPP_VALIDATION.md)
- [Android signing](docs/ANDROID_SIGNING.md)
- [Versioning and changelogs](docs/versioning-policy.md)
- [Changelog](CHANGELOG.md)

Original logo: `assets/brand/sticker-foundry-icon.png`. Check icons with `dart run tool/sync_brand.dart --check` from `apps/client`; omit `--check` to regenerate them.
