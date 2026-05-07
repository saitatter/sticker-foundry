# StickerFoundry Implementation Plan

This plan tracks the current state of StickerFoundry and the next implementation milestones.

## Current Baseline

Already implemented:

- Monorepo with NestJS backend, React web app, Kotlin Android app, shared TypeScript DTOs, Docker Compose, CI/release config, and documentation.
- Backend JWT login/register, refresh-token sessions, session revocation, registration modes (`open`, `invite-only`, `disabled`), password change flow, rate limiting, configurable CORS, health and metrics endpoints.
- Pack CRUD, pack clone, public/private visibility, sticker upload/delete/reorder/update, tray icon replacement, sticker image replacement, and WhatsApp ZIP export.
- Sharp media pipeline with real image-content validation, WebP conversion, 512x512 sticker resize, tray icon processing, compression limits, and WhatsApp pack constraints.
- Export API with `contents.json`, `tray_icon.webp`, sticker files, `GET /packs/:id/contents`, `GET /packs/:id/manifest`, `ETag`, and OpenAPI docs.
- Sync API with `contentHash`, `syncHash`, ownership flags, export readiness, and relative export/tray paths.
- Backend HTTP e2e coverage for register, pack creation, sticker upload, manifest `ETag`, ZIP export, and `contents.json` parsing.
- Pack collaboration with owner/viewer/editor roles, invite creation/acceptance/revocation, member listing, member removal, member role editing, role-aware mutation checks, and sync capability flags.
- Web UI with auth, demo login, pack dashboard search/filter/sort/status badges, pack detail, create/edit/delete/clone, collaboration invites/member management, sticker upload, bulk delete/bulk emoji apply, bulk copy/move to another pack, drag-and-drop uploads, image rotate/square crop, sticker replacement, tray replacement, ordering, ZIP download, contents preview, account password change, and session management.
- Playwright smoke test coverage for login, pack creation, upload, contents preview, collaboration panel visibility, and bulk copy workflow.
- Android app with MVVM, Retrofit, Room cache, refresh-token auth, local ZIP extraction, local sticker preview, WhatsApp `ContentProvider`, import intents for WhatsApp and WhatsApp Business, role-aware image upload/tray replacement, image rotate/square crop, server URL settings, logout, cache size/clear cache, import readiness, content-hash sync, and stale cache pruning.
- CI validates Android debug lint and debug APK assembly.
- Docker Compose with backend, web, PostgreSQL, `.env.example`, backend healthcheck, backup/restore docs, Unraid notes, and reverse proxy examples.
- Semantic-release with emoji release sections, release APK artifact, Dependabot, PR title validation, and issue templates.

Known gaps:

- Real-device WhatsApp and WhatsApp Business import still need hands-on validation.
- No background media queue, audit log, quotas, or advanced upload abuse protection beyond current validation/rate limits.

## Milestone 1: Real Import Validation

Goal: prove the Android bridge works against real WhatsApp clients.

Tasks:

- Install the debug APK on a physical Android phone.
- Point the Android settings screen at a LAN or HTTPS backend URL.
- Create a real pack with at least 3 stickers from the web UI.
- Sync the pack on Android and import into `com.whatsapp`.
- Import the same pack into `com.whatsapp.w4b`.
- Validate tray icon, sticker file reads, metadata columns, emojis, accessibility text, and `image_data_version` behavior.
- Document device, Android version, WhatsApp version, and any provider quirks.

Acceptance criteria:

- A synced pack imports successfully into WhatsApp.
- A synced pack imports successfully into WhatsApp Business.
- Any compatibility issues are turned into tracked issues or fixes.

## Milestone 2: Collaboration Polish

Goal: make shared-pack roles easier to audit and reason about.

Tasks:

- Add invite expiration controls in the web UI.
- Add clearer accepted/pending invite history filters.
- Consider optional email matching for invite acceptance.
- Add Android collaborator details beyond the compact role label.

Acceptance criteria:

- Owners can audit pending and accepted invites clearly.
- Editors and viewers see clear role information in Android and web.
- Private shared packs stay covered by backend authorization tests.

## Milestone 3: Advanced Media Editing

Goal: reduce the need for external image tools.

Tasks:

- Add pan/zoom crop in web.
- Add pan/zoom crop in Android.
- Add outline/stroke and shadow controls.
- Add transparent background preview.
- Add duplicate detection with perceptual hashes.
- Evaluate animated sticker support as a separate pipeline.

Acceptance criteria:

- Common sticker prep workflows are possible inside StickerFoundry.
- Duplicate or near-duplicate uploads can be warned or blocked.

## Milestone 4: Production Security

Goal: make internet-facing deployments safer.

Tasks:

- Add admin settings for registration mode and instance branding.
- Add per-user or per-instance storage quotas.
- Add audit logging for auth, pack, and sticker changes.
- Add stricter image bomb safeguards and upload pixel limits.
- Add HTTPS-first deployment checklist.

Acceptance criteria:

- Public deployments have documented security controls.
- Admins can inspect sensitive activity and enforce quotas.

## Milestone 5: Release And Ops Quality

Goal: keep changes safer as the project grows.

Tasks:

- Add web lint/format scripts.
- Add Android lint to CI.
- Add Playwright smoke tests for login, pack creation, upload, and export preview.
- Add release note polish with screenshots or APK install notes.
- Add Docker validation on an environment with Docker available.

Acceptance criteria:

- Pull requests cover backend, web, shared types, Android build, lint, and smoke tests.
- Release notes remain readable and useful.

## Near-Term Recommended Order

1. Real-device WhatsApp import validation.
2. Collaboration invite expiration/history polish.
3. Admin settings and quotas.
4. Audit log and storage limits.

## Design Notes

- Server remains the source of truth.
- Android remains a cache and WhatsApp bridge.
- `ContentProvider` is non-negotiable for WhatsApp integration because WhatsApp imports pack metadata and sticker files by querying the sticker app, not by reading remote URLs.
- `imageDataVersion` remains for WhatsApp compatibility, while `contentHash` is preferred for app sync decisions.
- Static stickers come first. Animated stickers should remain separate because their validation and processing rules differ.
