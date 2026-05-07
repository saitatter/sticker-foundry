# StickerFoundry Implementation Plan

This plan tracks the current state of StickerFoundry and the next implementation milestones.

## Current Baseline

Already implemented:

- Monorepo with NestJS backend, React web app, Kotlin Android app, shared TypeScript DTOs, Docker Compose, CI/release config, and documentation.
- Backend JWT login/register, registration modes (`open`, `invite-only`, `disabled`), password change flow, rate limiting, configurable CORS, health and metrics endpoints.
- Pack CRUD, pack clone, public/private visibility, sticker upload/delete/reorder/update, tray icon replacement, sticker image replacement, and WhatsApp ZIP export.
- Sharp media pipeline with real image-content validation, WebP conversion, 512x512 sticker resize, tray icon processing, compression limits, and WhatsApp pack constraints.
- Export API with `contents.json`, `tray_icon.webp`, sticker files, `GET /packs/:id/contents`, `GET /packs/:id/manifest`, `ETag`, and OpenAPI docs.
- Sync API with `contentHash`, `syncHash`, ownership flags, export readiness, and relative export/tray paths.
- Pack collaboration with owner/viewer/editor roles, invite creation/acceptance/revocation, member listing, member removal, member role editing, role-aware mutation checks, and sync capability flags.
- Web UI with auth, demo login, pack dashboard search/filter/sort/status badges, pack detail, create/edit/delete/clone, collaboration invites/member management, sticker upload, bulk delete/bulk emoji apply, drag-and-drop uploads, image rotate/square crop, sticker replacement, tray replacement, ordering, ZIP download, contents preview, and account password change.
- Android app with MVVM, Retrofit, Room cache, local ZIP extraction, local sticker preview, WhatsApp `ContentProvider`, import intents for WhatsApp and WhatsApp Business, role-aware image upload/tray replacement, image rotate/square crop, server URL settings, logout, cache size/clear cache, import readiness, content-hash sync, and stale cache pruning.
- Docker Compose with backend, web, PostgreSQL, `.env.example`, backend healthcheck, backup/restore docs, Unraid notes, and reverse proxy examples.
- Semantic-release with emoji release sections, release APK artifact, Dependabot, PR title validation, and issue templates.

Known gaps:

- Real-device WhatsApp and WhatsApp Business import still need hands-on validation.
- No Playwright/web smoke tests yet.
- No Android lint/test job yet, only debug build validation.
- No refresh tokens/session revocation yet.
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

## Milestone 2: Backend Integration Tests

Goal: cover the real API flow, not only service-level logic.

Tasks:

- Add a test database strategy for backend integration tests.
- Test register/login, create pack, upload 3 images, replace tray icon, export ZIP, and parse `contents.json`.
- Verify exported sticker and tray files exist in the ZIP.
- Test `If-None-Match` behavior for pack manifests.
- Test auth/visibility rules across owner and public packs.

Acceptance criteria:

- Integration tests run in CI or a documented local command.
- The WhatsApp export path is covered end to end.

## Milestone 3: Collaboration Client Polish

Goal: make shared-pack roles more transparent across clients.

Tasks:

- Add invite expiration controls in the web UI.
- Add clearer accepted/pending invite history.
- Consider optional email matching for invite acceptance.
- Add Android collaborator details beyond the compact role label.

Acceptance criteria:

- Editors and viewers see clear role information in Android and web.
- Owners can audit pending and accepted invites clearly.
- Private shared packs stay covered by backend authorization tests.

## Milestone 4: Sticker Workflow UX

Goal: make daily sticker management faster.

Tasks:

- Add copy/move to another pack.
- Add a sticker detail panel with richer metadata editing.
- Add local sticker grid preview in Android before import.
- Add optimistic UI updates for common web mutations.

Acceptance criteria:

- Users can manage many stickers without repetitive single-item actions.
- Web failures roll back or show clear recovery states.

## Milestone 5: Advanced Media Editing

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

## Milestone 6: Production Security

Goal: make internet-facing deployments safer.

Tasks:

- Add refresh tokens and session revocation.
- Add admin settings for registration mode and instance branding.
- Add per-user or per-instance storage quotas.
- Add audit logging for auth, pack, and sticker changes.
- Add stricter image bomb safeguards and upload pixel limits.
- Add HTTPS-first deployment checklist.

Acceptance criteria:

- Public deployments have documented security controls.
- Admins can disable sessions and audit sensitive changes.

## Milestone 7: Quality And Release Automation

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
2. Web copy/move sticker actions.
3. Refresh-token/session revocation.
4. Playwright web smoke tests.
5. Android lint/test CI.

## Design Notes

- Server remains the source of truth.
- Android remains a cache and WhatsApp bridge.
- `ContentProvider` is non-negotiable for WhatsApp integration because WhatsApp imports pack metadata and sticker files by querying the sticker app, not by reading remote URLs.
- `imageDataVersion` remains for WhatsApp compatibility, while `contentHash` is preferred for app sync decisions.
- Static stickers come first. Animated stickers should remain separate because their validation and processing rules differ.
