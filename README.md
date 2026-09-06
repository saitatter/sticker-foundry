<p align="center">
  <img src="assets/brand/sticker-foundry-logo.svg" alt="Sticker Foundry logo" width="104" height="104">
</p>

# 🎨 Sticker Foundry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![GitHub Release](https://img.shields.io/github/v/release/saitatter/sticker-foundry)
[![Issues](https://img.shields.io/github/issues/saitatter/sticker-foundry)](https://github.com/saitatter/sticker-foundry/issues)
![NestJS](https://img.shields.io/badge/NestJS-Backend-E0234E?logo=nestjs&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-Android-7F52FF?logo=kotlin&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Self--hosted-2496ED?logo=docker&logoColor=white)

> Self-hosted collaborative WhatsApp sticker pack manager.
>
> Turn image drops into WhatsApp-ready sticker packs with a web editor, NestJS backend, and Android bridge.

## ✨ Highlights

| Area    | What is included                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Album-style pack library, tabbed pack details, upload flow, review state, comments, bulk actions, and a compact overlay sticker editor. |
| Backend | NestJS API, PostgreSQL/Prisma, JWT auth, teams, invites, audit logs, storage, ZIP exports, metrics, and media processing.               |
| Editor  | Crop/normalize, erase/restore brush, text layer, cleanup tools, animated options, optimizer, presets, and before/after compare.         |
| Android | Server connection checks, Room cache, ZIP sync, local WhatsApp provider, WhatsApp/Business import intents, and edit/upload helpers.     |
| Deploy  | Source Compose stack with optional MinIO/MailHog development services and CPU AI background removal.                              |

## 🚀 Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

| Service | URL                              |
| ------- | -------------------------------- |
| Web     | `http://localhost:5173`          |
| API     | `http://localhost:3000/api`      |
| OpenAPI | `http://localhost:3000/api/docs` |

Demo login: `demo@stickerfoundry.local` / `stickerfoundry123`

## 🐳 Docker

The supported deployment is the source Compose stack. It builds and runs PostgreSQL, Redis, the NestJS backend, the queue worker, and the web server as separate services:

```bash
docker compose up -d --build
```

The web UI is available at `http://localhost:8080` and the API at `http://localhost:3000/api`. For Android on LAN, set the server URL to the backend host and port:

```text
http://YOUR_DOCKER_HOST:3000/api/
```

Set strong `POSTGRES_PASSWORD` and `JWT_SECRET` before exposing the app outside your LAN. PostgreSQL and Redis are kept on private Docker ports by default; publish them only for controlled local administration.

The host ports for PostgreSQL and Redis default to `5432` and `6379`. Override `POSTGRES_HOST_PORT` and `REDIS_HOST_PORT` in `.env` if another local stack already uses them. The MinIO/MailHog development override exposes analogous `*_HOST_PORT` variables.

### Storage contract

Disk and S3 use the same canonical layout:

```text
<S3_PREFIX>/<packId>/cover.webp
<S3_PREFIX>/<packId>/stickers/<fileName>
```

Every sticker stores its storage key, MIME type, width, height, checksum, and size in PostgreSQL. The API does not resolve alternate file locations. On an existing installation, make sure all sticker metadata and files already follow this contract before applying the latest database schema.

The latest schema makes this metadata mandatory and refuses to upgrade a database that still contains incomplete sticker records. Android sessions use encrypted storage; after updating the app, users with an older session format must sign in again.

For local S3 and email testing, start the development overrides:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

MinIO is available at `http://localhost:9001` and MailHog at `http://localhost:8025`. The override configures the backend and worker to use MinIO and sends password-reset emails to MailHog.

## 📱 Android

The Android build requires JDK 17. Configure `JAVA_HOME` to a JDK 17 installation before running Gradle.

```bash
cd apps/android
./gradlew :app:assembleDebug
```

Tester flow:

1. Install the APK.
2. Set the API URL in Android settings.
3. Log in and sync packs.
4. Import a pack with at least 3 exportable stickers into WhatsApp.

WhatsApp requires local files exposed through a `ContentProvider`; remote sticker URLs are not enough. Sticker Foundry downloads exports to app-private storage before handing them to WhatsApp.

## 🎨 Web UI Architecture

The web client remains React/Vite with CSS variables and domain-focused stylesheets for the workspace, editor, authentication, and responsive layout. This keeps the current editor and dense pack-management workflows easy to tune without introducing a second styling vocabulary.

`shadcn/ui` with Tailwind is worth adopting incrementally for new shared primitives such as buttons, inputs, dialogs, tabs, and notices. A full rewrite is not justified at the current stage: it would duplicate the existing CSS tokens and touch every screen without adding product capability. The intended path is to establish Tailwind tokens, add selected shadcn primitives, and migrate one workflow at a time while keeping the same visual tokens available to Android Compose.

## ✅ Current Validation Gaps

- Docker boot and PostgreSQL/Redis/MinIO smoke tests still need to run on a Docker host.
- The Android Gradle build needs JDK 17; the current workstation only exposes JDK 21.
- A production database upgrade must be run after its sticker files and metadata have been checked against the storage contract above.

## 🤖 AI Background Removal

Server-side AI cleanup uses `rembg` as the primary remover in the default Docker stack. It calls a local command that writes a transparent PNG to `{output}`:

```env
BACKGROUND_REMOVAL_COMMAND="rembg i {input} {output}"
```

If the command is unavailable or fails, Sticker Foundry falls back to the backend threshold remover. Set the command to empty only when you explicitly want the threshold fallback.

## ⚡ Useful Commands

| Task            | Command                                                          |
| --------------- | ---------------------------------------------------------------- |
| Backend build   | `npm run build:backend`                                          |
| Backend tests   | `npm run test:backend`                                           |
| Web build       | `npm run build:web`                                              |
| Web tests       | `npm run test:web`                                               |
| Web lint        | `npm run lint:web`                                               |
| Shared types    | `npm run build:shared-types`                                     |
| Release dry run | `npm run release:dry-run`                                        |
| Android debug   | `cd apps/android && ./gradlew :app:lintDebug :app:assembleDebug` |

## 🗺️ Repository Map

```text
apps/backend        NestJS API, Prisma schema, image processing, exports
apps/web            React/Vite web UI
apps/android        Kotlin Android app and WhatsApp ContentProvider
packages/shared-types
docs                Deployment, release, Android, and proxy notes
scripts             Operational helpers
docker-compose.yml
```

## 📚 Docs

- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [Reverse proxy examples](docs/REVERSE_PROXY.md)
- [Android signing](docs/ANDROID_SIGNING.md)
- [WhatsApp validation](docs/WHATSAPP_VALIDATION.md)
- [Feature backlog](docs/FEATURES_TO_ADD.md)
- [Release notes guide](docs/RELEASE_NOTES.md)
- [Docker validation](docs/DOCKER_VALIDATION.md)

## 🎨 Brand

The repository logo is a transparent SVG: [assets/brand/sticker-foundry-logo.svg](assets/brand/sticker-foundry-logo.svg). Android launcher and web favicon assets use the rounded-square PNG app icon for better platform fit.

Palette: deep teal `#08786f`, ink `#192124`, paper `#f7faf9`, forge accent `#f59e0b`, soft mint `#edf3f1`.

## 🔒 Release & Versioning

Uses **semantic-release** with Conventional Commits. Releases are manual (`workflow_dispatch`). Pushes to `main` run CI only.

Published release assets include:

- GitHub Release notes + tags (`vX.Y.Z`)
- Android debug APK
- Source server package archive

## 💛 Support

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/saitatter)
