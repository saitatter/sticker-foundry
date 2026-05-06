# StickerFoundry Implementation Plan

This plan tracks what is needed to turn the current starter into a usable self-hosted product.

## Current Baseline

Already implemented:

- Monorepo structure with backend, Android app, shared types, Docker Compose, and documentation.
- NestJS backend with JWT auth, Prisma/PostgreSQL schema, pack CRUD, sticker upload, Sharp processing, and ZIP export.
- WhatsApp-oriented export containing `contents.json`, `tray_icon.webp`, and WebP sticker files.
- Android Kotlin starter with MVVM, Retrofit, Room, local ZIP extraction, sync by `imageDataVersion`, WhatsApp import intent, and `ContentProvider`.
- Initial GitHub repository setup.

Known gaps:

- Android project has no committed Gradle wrapper yet.
- Android WhatsApp provider contract needs testing against real WhatsApp and WhatsApp Business.
- Backend has no automated tests yet.
- No web/admin UI exists yet.
- No production auth hardening beyond basic JWT.

## Milestone 1: Backend MVP Hardening

Goal: make the backend reliable enough for local self-hosting and Android sync tests.

Tasks:

- Add unit tests for auth, pack visibility, pack ownership, and validation rules.
- Add integration tests for the full flow: register, create pack, upload 3 stickers, export ZIP.
- Validate exported ZIP contents with a parser in tests.
- Add explicit endpoint docs or OpenAPI/Swagger.
- Add request rate limiting for auth and upload endpoints.
- Add upload content validation beyond MIME headers.
- Add delete sticker endpoint.
- Add update pack endpoint for name, publisher, description, and public/private state.
- Add endpoint to set or regenerate tray icon.
- Add health endpoint for Docker/Unraid monitoring.

Acceptance criteria:

- `npm test` passes.
- A newly created pack can be exported and parsed by Android.
- Invalid packs fail with clear 4xx responses.

## Milestone 2: Android Import Validation

Goal: prove the Android app can import a synced pack into WhatsApp.

Tasks:

- Add Gradle wrapper to `apps/android`.
- Build debug APK from CLI.
- Test with Android emulator using `10.0.2.2`.
- Test with a physical Android phone using a LAN backend URL.
- Validate `StickerContentProvider` column names and URI paths against WhatsApp's official sample.
- Test import into `com.whatsapp`.
- Test import into `com.whatsapp.w4b`.
- Add friendly error states for missing login, empty packs, sync failure, and WhatsApp not installed.
- Show sticker count and local sync version in the UI.
- Add a settings screen for API base URL instead of hardcoding it in `BuildConfig`.

Acceptance criteria:

- User can login, sync, tap "Add to WhatsApp", and confirm import in WhatsApp.
- WhatsApp can read tray icon and all sticker files through the provider.
- Packs with fewer than 3 stickers are not offered for import.

## Milestone 3: Web/Admin Experience

Goal: make pack management usable from a browser or desktop.

Tasks:

- Add `apps/web` with a small React or Next.js app.
- Login/register UI.
- Pack list and pack detail pages.
- Create/edit/delete pack UI.
- Upload sticker UI with progress and validation messages.
- Preview processed WebP stickers.
- Export/download ZIP button.
- Public/private pack toggle.
- Basic responsive design for desktop and tablet.

Acceptance criteria:

- A user can manage a full WhatsApp-compatible pack without using curl.
- UI prevents obvious invalid operations, such as exporting a pack with fewer than 3 stickers.

## Milestone 4: Sync and Versioning

Goal: make server-to-Android sync deterministic and efficient.

Tasks:

- Add `contentHash` to packs based on sticker hashes and tray icon hash.
- Return `contentHash` in pack list.
- Keep `imageDataVersion` for WhatsApp compatibility but use `contentHash` for app sync decisions.
- Add `GET /packs/:id/manifest` for metadata-only sync.
- Add ETag or `If-None-Match` support for export downloads.
- Track local extraction status in Room.
- Clean up Android local files for packs removed from server access.

Acceptance criteria:

- Android downloads only changed packs.
- Re-sync is safe after interrupted downloads.
- Server pack changes reliably produce a new version/hash.

## Milestone 5: Docker and Unraid Polish

Goal: make deployment boring.

Tasks:

- Validate `docker compose up -d --build` on a Docker host.
- Add container healthcheck for backend.
- Document host-path volume examples for Unraid.
- Add `.env` support for compose instead of hardcoded example secrets.
- Add backup/restore instructions for PostgreSQL and `/data`.
- Add reverse proxy examples for Caddy, Nginx Proxy Manager, or Traefik.

Acceptance criteria:

- Fresh Unraid deployment can boot, migrate, and serve the API.
- Data survives container recreation.

## Milestone 6: CI and Release Hygiene

Goal: keep the repository healthy as features grow.

Tasks:

- Add GitHub Actions for backend install, Prisma generate, build, and tests.
- Add GitHub Actions for Android Gradle build once wrapper is committed.
- Add formatting/linting scripts.
- Add Dependabot or Renovate.
- Add release notes workflow.
- Add issue templates for bug reports and feature requests.

Acceptance criteria:

- Pull requests show backend and Android validation status.
- Main branch remains buildable.

## Milestone 7: Security and Production Readiness

Goal: reduce risk before exposing the service outside a trusted LAN.

Tasks:

- Replace long-lived access-only auth with refresh tokens or shorter sessions.
- Add password reset flow if email is configured.
- Add admin controls for registration mode: open, invite-only, disabled.
- Add per-user storage quotas.
- Add audit logging for pack changes.
- Add malware/image bomb safeguards for uploads.
- Add stricter CORS config.
- Add HTTPS deployment docs.

Acceptance criteria:

- Public internet deployment has documented security settings.
- Abuse-prone endpoints are rate-limited and validated.

## Near-Term Recommended Order

1. Add the Android Gradle wrapper and verify debug build.
2. Run the backend with Postgres and create a real pack with 3 stickers.
3. Test Android sync and WhatsApp import on a physical phone.
4. Fix provider/export compatibility issues discovered during real import.
5. Add backend integration tests around the working import path.
6. Add a small web UI for pack management.

## Design Notes

- Server remains the source of truth.
- Android remains a cache and WhatsApp bridge.
- `ContentProvider` is non-negotiable for WhatsApp integration because WhatsApp imports pack metadata and sticker files by querying the sticker app, not by reading remote URLs.
- Static stickers come first. Animated stickers should be treated as a separate milestone because their constraints and validation rules differ.
