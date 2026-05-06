# StickerFoundry

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![GitHub Release](https://img.shields.io/github/v/release/saitatter/sticker-foundry)
[![Issues](https://img.shields.io/github/issues/saitatter/sticker-foundry)](https://github.com/saitatter/sticker-foundry/issues)
![NestJS](https://img.shields.io/badge/NestJS-Backend-E0234E?logo=nestjs&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-Android-7F52FF?logo=kotlin&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Self--hosted-2496ED?logo=docker&logoColor=white)

StickerFoundry is a self-hosted collaborative WhatsApp sticker pack manager, shaped like a small "Immich for stickers": the backend is the source of truth, desktop/web clients can manage packs through the API, and the Android app syncs compatible packs into local storage so WhatsApp can import them.

## ✨ Features

- Self-hosted NestJS API with PostgreSQL and Prisma.
- JWT register/login.
- Registration mode control with `REGISTRATION_MODE=open|invite-only|disabled` and optional `REGISTRATION_INVITE_CODE`.
- Pack CRUD with ownership and public pack visibility.
- Sticker upload with WebP conversion, 512x512 resize, and WhatsApp size validation.
- Upload validation checks actual image content in addition to MIME headers.
- WhatsApp-compatible ZIP export with `contents.json`, `tray_icon.webp`, and sticker files.
- Android Kotlin app with Retrofit sync, Room cache, local ZIP extraction, owner image uploads, rotate/crop editing, and WhatsApp import intent.
- Android `ContentProvider` for WhatsApp metadata and sticker file access.
- Docker Compose stack for backend + PostgreSQL.
- Semantic-release workflow with Conventional Commits, changelog generation, GitHub Releases, and Android debug APK release asset.

## 🚧 Project Status

Current state:

- Backend API: starter MVP implemented.
- Android app: starter MVP implemented and debug build passes.
- Web UI: starter MVP implemented in `apps/web`.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the staged roadmap and [docs/FEATURES_TO_ADD.md](docs/FEATURES_TO_ADD.md) for the feature backlog.

## 🧱 Architecture

The platform is split into three layers:

- `apps/backend`: NestJS API, PostgreSQL persistence, Prisma ORM, Sharp image processing, disk storage under `/data/packs/{pack_id}`.
- `apps/android`: Kotlin Android app using MVVM, Retrofit, Room, local ZIP extraction, and a WhatsApp-compatible `ContentProvider`.
- `packages/shared-types`: TypeScript DTOs shared by server-side tooling or future web clients.

The server owns users, packs, stickers, metadata, and normalized media. Android is intentionally a cache: it downloads ZIP exports, extracts files into app-private storage, stores metadata in Room, and exposes those local files to WhatsApp.

WhatsApp does not import arbitrary remote sticker URLs. It asks the sticker app's `ContentProvider` for pack metadata and sticker binary files. That is why the Android app must keep sticker files local and must declare an exported provider with the `com.whatsapp.sticker.READ` read permission. The import intent only starts the confirmation flow; WhatsApp still reads the pack through provider URIs.

The static sticker constraints implemented here match WhatsApp's Android sticker app requirements: 3-30 stickers per pack, 512x512 WebP stickers, static sticker size <=100KB, tray icon 96x96 and <=50KB. Animated packs are deliberately out of scope for this starter.

References:

- WhatsApp official Android sticker sample and README: https://github.com/WhatsApp/stickers/tree/main/Android
- Android ContentProvider docs: https://developer.android.com/guide/topics/providers/content-provider-creating

## 📦 Monorepo Structure

```text
sticker-foundry/
  apps/
    backend/
      prisma/
      src/
      Dockerfile
    android/
      app/
      build.gradle.kts
      settings.gradle.kts
  packages/
    shared-types/
  docker-compose.yml
  README.md
```

This keeps deployable apps in `apps`, reusable contracts in `packages`, and infrastructure at the root. The backend and Android app can evolve independently while staying in one repository.

## 🖥️ Backend

Key files:

- `apps/backend/src/auth/*`: JWT register/login.
- `apps/backend/src/packs/packs.controller.ts`: pack CRUD, sticker upload, ZIP export.
- `apps/backend/src/packs/sticker-image.service.ts`: WebP conversion, resize, compression.
- `apps/backend/src/packs/pack-export.service.ts`: `contents.json`, `tray_icon.webp`, sticker ZIP generation.
- `apps/backend/prisma/schema.prisma`: database schema.

### 🚀 Run locally

```bash
cd sticker-foundry
npm install
cp apps/backend/.env.example apps/backend/.env
docker compose up -d postgres
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

`npm run dev` starts the backend and web app together. For a fresh database, use `npm run dev:seeded` after PostgreSQL is running; it applies migrations, seeds demo data, then starts both apps.

- backend API: `http://localhost:3000/api`
- OpenAPI docs: `http://localhost:3000/api/docs`
- web UI: `http://localhost:5173`

The seed command creates a local demo account and a WhatsApp-compatible demo pack:

- email: `demo@stickerfoundry.local`
- password: `stickerfoundry123`
- pack: `Foundry Classics`

The web login screen includes a **Use demo account** button that fills these seeded credentials.

Registration is open by default. For public deployments, set `REGISTRATION_MODE=invite-only` with `REGISTRATION_INVITE_CODE`, or set `REGISTRATION_MODE=disabled` after creating your admin account.

CORS is open by default for local development. For production, set `CORS_ORIGIN` to a comma-separated allowlist, for example:

```bash
CORS_ORIGIN=https://stickers.example.com,https://admin.example.com
```

### 🧪 Backend tests

```bash
npm run test:backend
```

The backend test suite covers pack/sticker business rules, sticker ordering, and WhatsApp export metadata.

### 🔌 API examples

Interactive OpenAPI documentation is available at:

```text
http://localhost:3000/api/docs
```

The raw OpenAPI JSON is available at:

```text
http://localhost:3000/api/docs-json
```

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","displayName":"Admin","password":"password123"}'
```

```bash
TOKEN="paste-jwt-here"
curl -X POST http://localhost:3000/api/packs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Family Memes","publisher":"Home","isPublic":false}'
```

```bash
curl http://localhost:3000/api/sync/packs \
  -H "Authorization: Bearer $TOKEN"
```

`GET /sync/packs` is the Android sync index. It returns pack metadata, `imageDataVersion`, `updatedAt`, `contentHash`, `syncHash`, `canExport`, and relative download paths so the app can skip unchanged or incomplete packs.

```bash
curl -i http://localhost:3000/api/packs/PACK_ID/manifest \
  -H "Authorization: Bearer $TOKEN"
```

`GET /packs/:id/manifest` returns metadata, sticker file hashes, `contentHash`, and an `ETag`. Clients can send `If-None-Match` to receive `304 Not Modified` without downloading the full ZIP.

```bash
curl http://localhost:3000/api/health
```

```bash
curl -X POST http://localhost:3000/api/packs/PACK_ID/stickers \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@sticker.png" \
  -F "emojis=smile,laugh"
```

```bash
curl -L http://localhost:3000/api/packs/PACK_ID/export \
  -H "Authorization: Bearer $TOKEN" \
  -o pack.zip
```

`GET /packs/:id/export` returns a ZIP containing:

- `contents.json`
- `tray_icon.webp`
- one `.webp` file per sticker

The generated `contents.json` uses WhatsApp's sticker pack fields, including `identifier`, `name`, `publisher`, `tray_image_file`, `image_data_version`, `animated_sticker_pack`, and per-sticker `image_file`, `emojis`, and `accessibility_text`.

## 📱 Android

Key files:

- `apps/android/app/src/main/java/com/example/stickerplatform/data/StickerApi.kt`: Retrofit API.
- `apps/android/app/src/main/java/com/example/stickerplatform/data/LocalDatabase.kt`: Room cache.
- `apps/android/app/src/main/java/com/example/stickerplatform/data/StickerRepository.kt`: server sync and ZIP extraction.
- `apps/android/app/src/main/java/com/example/stickerplatform/whatsapp/StickerContentProvider.kt`: WhatsApp provider contract.
- `apps/android/app/src/main/java/com/example/stickerplatform/whatsapp/WhatsAppStickerLauncher.kt`: `ENABLE_STICKER_PACK` intent.

Open `apps/android` in Android Studio. For the emulator, the default API URL is:

```kotlin
http://10.0.2.2:3000/api/
```

For a physical phone, change `API_BASE_URL` in `apps/android/app/build.gradle.kts` to your server LAN URL, for example:

```kotlin
buildConfigField("String", "API_BASE_URL", "\"http://192.168.1.50:3000/api/\"")
```

The Android app also has a Settings dialog where testers can change the API URL, log out, inspect cache size, and clear the local pack cache without rebuilding the APK.

User flow:

1. Login in the app.
2. Tap `Sync`.
3. The app fetches packs from the server.
4. For changed packs, it downloads `/packs/{id}/export`.
5. It extracts the ZIP into app-private local storage.
6. Owned packs show image actions for uploading a sticker or replacing the tray icon, with rotate and square-crop controls before upload.
7. Packs show sticker count and disable WhatsApp import until they have at least 3 stickers.
8. Tap `Add to WhatsApp`.
9. WhatsApp or WhatsApp Business opens its import confirmation and reads metadata/files from `StickerContentProvider`.

Sync strategy:

- Server is source of truth.
- Android stores a cache in Room and app-private files.
- Backend increments `imageDataVersion` whenever sticker content changes.
- Android stores the server `contentHash` when available, falls back to `syncHash`, and downloads only changed packs.

## 🌐 Web UI

The web app lives in `apps/web` and provides:

- Login/register UI.
- Pack dashboard search, filters, sorting, and quick status badges.
- Pack list and pack detail view.
- Create/edit/delete pack UI.
- Sticker upload with validation feedback.
- Processed WebP preview.
- Tray icon preview and replacement.
- Sticker emoji and accessibility text editing.
- Sticker image replacement.
- Sticker image replacement from web UI.
- Client-side rotate and square crop before upload or replacement.
- Sticker reorder controls.
- Drag-and-drop sticker ordering.
- Bulk sticker upload.
- Sticker delete action.
- Export ZIP download.
- Export `contents.json` preview.
- Public/private pack creation.

Run it locally:

```bash
npm run dev:web
```

By default, Vite proxies `/api` to `http://localhost:3000`. Set `VITE_API_URL` when pointing the web app at a different backend URL.

## 🐳 Docker Setup

Run web + backend + PostgreSQL:

```bash
cd sticker-foundry
docker compose up -d --build
```

Services listen on:

```text
http://localhost:8080
http://localhost:3000/api
```

Persistent volumes:

- `postgres-data`: database.
- `foundry-data`: `/data/packs/{pack_id}` media files.

### 💾 Backup and restore

Back up PostgreSQL:

```bash
docker compose exec -T postgres pg_dump -U stickers stickers > stickers.sql
```

Back up sticker media:

```bash
docker run --rm -v sticker-foundry_foundry-data:/data -v "$PWD:/backup" alpine tar czf /backup/foundry-data.tgz -C /data .
```

Restore PostgreSQL:

```bash
docker compose exec -T postgres psql -U stickers stickers < stickers.sql
```

Restore sticker media:

```bash
docker run --rm -v sticker-foundry_foundry-data:/data -v "$PWD:/backup" alpine sh -c "rm -rf /data/* && tar xzf /backup/foundry-data.tgz -C /data"
```

Unraid deployment:

1. Copy this repository to an Unraid appdata path or use a Git checkout.
2. In Docker Compose Manager, point to `docker-compose.yml`.
3. Set strong values for `JWT_SECRET` and `POSTGRES_PASSWORD`.
4. Map `3000:3000`.
5. Map `foundry-data` to a durable appdata directory if you prefer a host path, for example `/mnt/user/appdata/sticker-foundry/data:/data`.
6. Start the stack. The backend runs `prisma migrate deploy` before booting.

## 🔄 Releases

StickerFoundry uses **semantic-release** with Conventional Commits. On every push to `main`, CI checks whether a new version should be published.

Use commit messages like:

- `feat: add pack sharing`
- `fix: reject oversized tray icons`
- `ci: add Android build workflow`
- `docs: update Unraid setup`

Release behavior:

- `feat` creates a minor release.
- `fix`, `perf`, `refactor`, `ci`, and `chore` create patch releases.
- `docs` and `test` are included in release notes but do not create a release by themselves.
- `BREAKING CHANGE:` or `!` creates a major release.
- Release notes and generated changelog sections use emoji categories like `✨ Features`, `🐛 Fixes`, and `📚 Docs`.
- `CHANGELOG.md`, root/backend/shared package versions, lockfile version, and Android `versionName`/`versionCode` are updated automatically.
- The Android debug APK is attached to GitHub Releases as an early testing artifact.

Local dry run:

```bash
npm run release:dry-run
```

GitHub release workflow expects either `RELEASE_PAT` or the default `GITHUB_TOKEN`. If `RELEASE_PAT` is configured, it should have repository contents permissions.

## 🧰 Git Setup Instructions

```bash
cd sticker-foundry
git init
git add .
git commit -m "Initial commit"
```

Optional GitHub remote:

```bash
git remote add origin git@github.com:saitatter/sticker-foundry.git
git branch -M main
git push -u origin main
```

Initial commit structure should include:

- root monorepo config
- backend NestJS app
- Android Kotlin app
- shared DTO package
- Docker/Compose files
- README and `.gitignore`

## 🛠 Troubleshooting

- **Android build cannot find SDK**: install Android Studio or set `ANDROID_HOME` to an Android SDK path.
- **Android build uses Java 8**: install JDK 17 and set `JAVA_HOME`.
- **WhatsApp import does not open**: verify WhatsApp is installed and the pack has at least 3 stickers.
- **Export fails**: verify the pack has 3-30 stickers and all images can be compressed to WhatsApp limits.
- **Upload is rejected**: sticker source uploads are capped at 10 MB, tray icon source uploads at 5 MB.
- **Too many requests**: the API applies an in-memory rate limit. Tune it with `THROTTLE_TTL_MS` and `THROTTLE_LIMIT`.

## 📝 Notes

This project is a real starting point, not a complete production deployment. Before exposing it outside your LAN, add HTTPS, rate limiting, refresh tokens or short-lived access tokens, backups, stricter upload scanning, and richer admin controls.

WhatsApp limitations to remember:

- Users must confirm each pack import manually.
- Apps should list packs separately; bulk "add all" is not supported.
- WhatsApp caches imported stickers; changing server files alone does not force old imports to refresh unless `image_data_version` changes and the pack is re-imported.
- Copying WebP files into WhatsApp media folders is not enough. WhatsApp relies on pack metadata and provider-imported content, not only files on disk.

## 📄 License

MIT © saitatter
