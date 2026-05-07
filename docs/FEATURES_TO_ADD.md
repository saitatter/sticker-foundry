# StickerFoundry Features To Add

This is the live feature backlog. Items already shipped are kept briefly at the top so future planning has context.

## Shipped Recently

- Pack dashboard search, filters, sorting, and quick status badges.
- Pack duplicate/clone flow for remixing existing packs.
- Web drag-and-drop image upload zone.
- Web and Android rotate/square-crop image editing before upload.
- Sticker image replacement from backend and web.
- Android owner actions for uploading stickers and replacing tray icons.
- Android settings for server URL, logout, cache usage, and cache cleanup.
- Android import readiness state and WhatsApp Business import target.
- Android content-hash sync and stale local cache cleanup.
- Swagger/OpenAPI docs.
- Pack manifest endpoint with `ETag`.
- `contentHash` in sync responses.
- Invite-only/disabled registration modes.
- Password change flow.
- Configurable CORS origins.
- Stronger upload content validation.
- Pack collaboration roles, invite creation/acceptance/revocation, member listing/removal, role editing, and role-aware web controls.
- Android shared-pack role display and role-aware editor controls.
- Android local sticker preview before importing into WhatsApp.
- Web sticker multi-select with bulk delete and bulk emoji apply.
- Refresh-token sessions with web session revocation and Android token refresh.
- Compose `.env.example` and reverse proxy examples.
- Dependabot and GitHub issue templates.
- Metrics endpoint for basic monitoring.

## Next: Real WhatsApp Validation

- Validate import on a physical Android phone with current WhatsApp.
- Validate import on WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android/WhatsApp versions.
- Add fixes for any provider compatibility issues discovered during real-device testing.

## Next: Backend Quality

- End-to-end backend integration test: register, login, create pack, upload 3 stickers, export ZIP.
- Parse exported ZIP in tests and verify `contents.json`, tray icon, and sticker files.
- Test manifest `ETag` and `If-None-Match` behavior over HTTP.
- Test cross-user visibility with owner/public/private packs.
- Add test database setup for CI.

## Collaboration

- Invite expiration controls in the web UI.
- Optional email matching for invite acceptance.
- Accepted/pending invite history filters.
- Shared team/workspace model for family or community packs.
- Comments or review status per sticker.
- Optional approval flow before a sticker becomes part of an exported pack.

## Sticker Workflow UX

- Sticker detail panel with larger preview and full metadata editing.
- Bulk copy/move for selected stickers.
- Bulk accessibility text generation for selected stickers.
- Copy or move individual stickers to another pack.
- Better mobile web layout for quick edits from a phone browser.
- Activity feed showing who changed pack metadata or images.
- Public share page for a pack with install instructions.

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
- Optimistic UI updates with rollback on API failure.
- Playwright smoke-test-friendly selectors.

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

## Release And Quality

- Web lint and format scripts.
- Android lint in CI.
- Backend integration tests in CI.
- Playwright smoke tests for the web UI.
- Release notes polish with screenshots or APK install notes.
- Signed Android release builds later, once package identity is finalized.
