# StickerFoundry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![GitHub Release](https://img.shields.io/github/v/release/saitatter/sticker-foundry)
![NestJS](https://img.shields.io/badge/NestJS-Backend-E0234E?logo=nestjs&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-Android-7F52FF?logo=kotlin&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Self--hosted-2496ED?logo=docker&logoColor=white)

StickerFoundry is a self-hosted collaborative WhatsApp sticker pack manager: web users manage packs on a server, the backend normalizes and exports WhatsApp-compatible media, and the Android app syncs packs locally so WhatsApp can import them.

## ✨ What Works

- NestJS API with PostgreSQL, Prisma, JWT auth, refresh sessions, password reset, audit logs, teams, roles, invites, and admin settings.
- Sticker upload pipeline with WebP conversion, 512x512 normalization, static/animated validation, animated trim/FPS resampling, duplicate detection, image bomb safeguards, and queued media processing.
- Disk storage by default, optional S3-compatible storage, cached ZIP exports, manifest/ETag sync, and Prometheus metrics.
- Web UI for pack management, collaboration, public share pages, review status, comments, bulk actions, keyboard shortcuts, and responsive sticker grids.
- Sticker editor with brush erase/restore, undo/redo, background cleanup, text layer, auto-fit subject, color tools, size optimizer, animated controls, batch presets, and before/after compare.
- Background removal can run in-browser, on the backend threshold pipeline, or through an optional self-hosted AI command with threshold fallback.
- Android Kotlin app with Retrofit, Room cache, retry-safe ZIP extraction, local extraction status, upload-time crop/color/text editing, WhatsApp and WhatsApp Business import intents, and stale-edit conflict handling.
- Docker Compose stack for PostgreSQL, backend, and web.
- Semantic-release with emoji changelog sections and Android debug APK release asset.

## 🧱 Monorepo

```text
apps/backend        NestJS API, Prisma schema, image processing, exports
apps/web            React/Vite web UI
apps/android        Kotlin Android app and WhatsApp ContentProvider
packages/shared-types
docs                Deployment, release, Android, and proxy notes
scripts             Operational helpers
docker-compose.yml
```

The backend is the source of truth. Android is a local cache and WhatsApp bridge.

## 🚀 Local Development

Requirements:

- Node.js 20+
- PostgreSQL or Docker for the local database
- Android Studio/JDK 17 for Android work

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`
- OpenAPI: `http://localhost:3000/api/docs`

Seeded demo login:

- Email: `demo@stickerfoundry.local`
- Password: `stickerfoundry123`

## 🐳 Docker

Run the stack:

```bash
cp .env.example .env
docker compose up -d --build
```

Services:

- Web: `http://localhost:8080`
- API: `http://localhost:3000/api`
- PostgreSQL: internal service `postgres`

Set strong `POSTGRES_PASSWORD` and `JWT_SECRET` before exposing anything outside your LAN.

### 🖼️ AI Background Removal

The backend can call a local self-hosted remover command for `Server bg: AI/fallback` uploads. The command must write a transparent PNG to `{output}`:

```env
BACKGROUND_REMOVAL_COMMAND="rembg i {input} {output}"
```

Any compatible local tool works here, including a Python ONNX/RMBG/U²-Net/MODNet script. If the command is empty or fails, StickerFoundry automatically uses the backend threshold remover instead.

For a bundled CPU AI image using `rembg`, run Compose with the override:

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
```

## 📱 Android

Build debug APK:

```bash
cd apps/android
./gradlew :app:assembleDebug
```

Basic tester flow:

1. Install the debug APK.
2. Set the API URL in Android settings.
3. Log in and sync packs.
4. Tap `WhatsApp` or `Business` on a pack with at least 3 exportable stickers.
5. Confirm the import in WhatsApp.

WhatsApp requires sticker apps to expose pack metadata and local files through a `ContentProvider`; remote URLs are not enough. StickerFoundry therefore downloads ZIP exports to app-private storage and exposes local files to WhatsApp during import.

## 🧪 Useful Commands

```bash
npm run build:backend
npm run test:backend
npm run build:web
npm run test:web
npm run lint:web
npm run build:shared-types
npm run release:dry-run
npm run verify:backup -- --postgres stickers.sql --data foundry-data.tgz
```

Android:

```bash
cd apps/android
./gradlew :app:lintDebug :app:assembleDebug
./gradlew :app:assembleRelease
```

## 🔌 API Pointers

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/packs`
- `POST /api/packs`
- `POST /api/packs/:id/stickers`
- `PUT /api/packs/:id/stickers/:stickerId/file`
- `GET /api/packs/:id/export`
- `GET /api/packs/:id/manifest`
- `GET /api/public/packs`
- `GET /api/public/packs/:id`
- `GET /api/health`
- `GET /api/metrics?format=prometheus`

Use OpenAPI at `/api/docs` for the full contract.

## 📚 Docs

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Feature backlog](docs/FEATURES_TO_ADD.md)
- [Real WhatsApp validation](docs/WHATSAPP_VALIDATION.md)
- [Docker validation](docs/DOCKER_VALIDATION.md)
- [Reverse proxy examples](docs/REVERSE_PROXY.md)
- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [Unraid notes](docs/UNRAID.md)
- [Android signing](docs/ANDROID_SIGNING.md)
- [Release notes guide](docs/RELEASE_NOTES.md)

## 🚧 Remaining Work

The main open items are real-device WhatsApp validation, Docker stack validation on a host with Docker installed, Android signing validation, Docker-host validation for the optional AI remover, and the remaining Android editor parity items. See [docs/FEATURES_TO_ADD.md](docs/FEATURES_TO_ADD.md).
