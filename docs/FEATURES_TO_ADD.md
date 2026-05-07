# StickerFoundry Features To Add

This is the live feature backlog. Items already shipped are kept briefly at the top so future planning has context.

## Shipped Recently

- Pack dashboard search, filters, sorting, and quick status badges.
- Pack duplicate/clone flow for remixing existing packs.
- Web drag-and-drop image upload zone.
- Web and Android rotate/square-crop image editing before upload.
- Sticker image replacement from backend and web.
- Android owner/editor actions for uploading stickers and replacing tray icons.
- Android settings for server URL, logout, cache usage, and cache cleanup.
- Android import readiness state and WhatsApp Business import target.
- Android content-hash sync and stale local cache cleanup.
- Android local sticker preview before importing into WhatsApp.
- Swagger/OpenAPI docs.
- Pack manifest endpoint with `ETag`.
- Backend export e2e flow with ZIP and `contents.json` parsing.
- `contentHash` in sync responses.
- Invite-only/disabled registration modes.
- Password change flow.
- Refresh-token sessions with web session revocation and Android token refresh.
- Configurable CORS origins.
- Stronger upload content validation.
- Pack collaboration roles, invite creation/acceptance/revocation, member listing/removal, role editing, and role-aware web/Android controls.
- Web sticker multi-select with bulk delete, bulk emoji apply, and copy/move to another pack.
- Compose `.env.example` and reverse proxy examples.
- Dependabot and GitHub issue templates.
- Metrics endpoint for basic monitoring.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.

## Next: Quality Gates

- Playwright smoke tests for login, pack creation, upload, contents preview, export readiness, and collaboration panel visibility.
- Stable web test selectors for smoke-test-heavy surfaces.
- Android lint in CI.
- Document local Android build requirements: JDK 17 and Android SDK env vars.
- Add a CI job or documented command for backend e2e tests.

## Collaboration

- Invite expiration controls in the web UI.
- Optional email matching for invite acceptance.
- Accepted/pending invite history filters.
- Android collaborator details beyond the compact role label.
- Shared team/workspace model for family or community packs.
- Comments or review status per sticker.
- Optional approval flow before a sticker becomes part of an exported pack.

## Sticker Workflow UX

- Sticker detail panel with larger preview and full metadata editing.
- Bulk accessibility text generation for selected stickers.
- Copy or move individual stickers from a sticker tile/detail panel.
- Better mobile web layout for quick edits from a phone browser.
- Activity feed showing who changed pack metadata or images.
- Public share page for a pack with install instructions.
- Optimistic UI updates with rollback on API failure.

## Media Editing

- Web editor with pan/zoom crop.
- Android editor with pan/zoom crop and live output size estimate.
- Background removal.
- Outline/stroke and shadow controls.
- Transparent background checkerboard preview.
- Batch image normalization before upload.
- Duplicate sticker detection using perceptual hashes.
- Animated sticker support as a separate opt-in pipeline.

## Android

- Better friendly error states for network failures and invalid server URLs.
- Manual per-pack resync control.
- Per-pack local cache cleanup.
- Account state display in settings.
- Real-device compatibility notes inside README.
- Optional import troubleshooting screen for provider/WhatsApp errors.

## Backend

- Password reset flow if email is configured.
- Admin settings page/API for registration mode, quotas, and instance branding.
- Per-user storage quotas.
- Audit log for sensitive actions.
- Upload pixel-count limits and image bomb safeguards.
- Background media processing queue for heavier transforms.
- Optional S3-compatible storage backend.
- Server-side pack export cache invalidated by `imageDataVersion`.

## Web App

- Admin settings page for registration mode, quotas, and instance branding.
- Public pack browser for visible packs.
- Keyboard shortcuts for review and ordering workflows.
- Playwright smoke-test-friendly selectors.
- Better responsive layout for dense sticker grids on small screens.

## Sync And Reliability

- Use manifest/ETag from Android before ZIP download.
- Resumable or retry-safe Android downloads.
- Track local extraction status in Room.
- Export cache on server for unchanged packs.
- Better conflict handling when the same pack is edited from web and Android.

## Deployment And Ops

- Validate `docker compose up -d --build` on a host with Docker installed.
- Container healthcheck for web.
- Backup verification script for PostgreSQL and `/data`.
- Metrics format option for Prometheus.
- HTTPS-first production checklist.
- Unraid template notes for web + backend + PostgreSQL volumes.

## Release And Quality

- Web lint and format scripts.
- Android lint in CI.
- Playwright smoke tests for the web UI.
- Release notes polish with screenshots or APK install notes.
- Signed Android release builds later, once package identity is finalized.
