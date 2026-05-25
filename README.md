<table>
  <tr>
    <td width="104">
      <img src="assets/brand/sticker-foundry-logo.svg" alt="Sticker Foundry logo" width="88" height="88" />
    </td>
    <td>
      <h1>Sticker Foundry</h1>
      <p><strong>Self-hosted collaborative WhatsApp sticker pack manager.</strong></p>
      <p>
        <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
        <img alt="GitHub Release" src="https://img.shields.io/github/v/release/saitatter/sticker-foundry" />
        <img alt="NestJS backend" src="https://img.shields.io/badge/NestJS-Backend-E0234E?logo=nestjs&logoColor=white" />
        <img alt="Kotlin Android" src="https://img.shields.io/badge/Kotlin-Android-7F52FF?logo=kotlin&logoColor=white" />
        <img alt="Docker self-hosted" src="https://img.shields.io/badge/Docker-Self--hosted-2496ED?logo=docker&logoColor=white" />
      </p>
    </td>
  </tr>
</table>

Sticker Foundry turns image drops into WhatsApp-ready sticker packs. The web app manages packs and collaboration, the backend normalizes and exports media, and the Android app syncs packs locally so WhatsApp can import them.

## Highlights

| Area    | What is included                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Web     | Album-style pack library, tabbed pack details, upload flow, review state, comments, bulk actions, and a compact overlay sticker editor. |
| Backend | NestJS API, PostgreSQL/Prisma, JWT auth, teams, invites, audit logs, storage, ZIP exports, metrics, and media processing.               |
| Editor  | Crop/normalize, erase/restore brush, text layer, cleanup tools, animated options, optimizer, presets, and before/after compare.         |
| Android | Server connection checks, Room cache, ZIP sync, local WhatsApp provider, WhatsApp/Business import intents, and edit/upload helpers.     |
| Deploy  | Source Compose stack plus a GHCR all-in-one image for Unraid-style installs with web, API, PostgreSQL, and CPU AI background removal.   |

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres
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

## Docker / Unraid

For a pull-only deployment, use the packaged all-in-one image:

```bash
docker compose -f docker-compose.packages.yml --env-file .env up -d
```

Image: `ghcr.io/saitatter/sticker-foundry:latest`

The package serves web and API on one port, with the API under `/api`. For Android on LAN, set the server URL to:

```text
http://YOUR_UNRAID_IP:WEB_PORT/api/
```

Set strong `POSTGRES_PASSWORD` and `JWT_SECRET` before exposing the app outside your LAN.

## Android

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

## AI Background Removal

Server-side AI cleanup can call any local command that writes a transparent PNG to `{output}`:

```env
BACKGROUND_REMOVAL_COMMAND="rembg i {input} {output}"
```

If the command is empty or fails, Sticker Foundry falls back to the backend threshold remover.

## Useful Commands

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

## Repository Map

```text
apps/backend        NestJS API, Prisma schema, image processing, exports
apps/web            React/Vite web UI
apps/android        Kotlin Android app and WhatsApp ContentProvider
packages/shared-types
docs                Deployment, release, Android, and proxy notes
scripts             Operational helpers
docker-compose.yml
```

## Docs

- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [Unraid notes](docs/UNRAID.md)
- [Reverse proxy examples](docs/REVERSE_PROXY.md)
- [Android signing](docs/ANDROID_SIGNING.md)
- [WhatsApp validation](docs/WHATSAPP_VALIDATION.md)
- [Feature backlog](docs/FEATURES_TO_ADD.md)
- [Release notes guide](docs/RELEASE_NOTES.md)

## Brand

The repository logo is a transparent SVG: [assets/brand/sticker-foundry-logo.svg](assets/brand/sticker-foundry-logo.svg). Android launcher and web favicon assets use the rounded-square PNG app icon for better platform fit.

Palette: deep teal `#08786f`, ink `#192124`, paper `#f7faf9`, forge accent `#f59e0b`, soft mint `#edf3f1`.

---

## Support

If Sticker Foundry is useful to you, you can support ongoing development on [Ko-fi](https://ko-fi.com/saitatter).
