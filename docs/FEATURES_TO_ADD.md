# StickerFoundry Features To Add

This is the working feature backlog for turning StickerFoundry from a strong MVP into a polished self-hosted product.

## Product UX

- Pack dashboard with search, filters, sort, and quick status badges.
- Sticker detail panel with full metadata editing, image replacement, delete, and copy/move to another pack.
- Bulk actions for selected stickers: delete, copy, move, emoji apply, and accessibility text generation.
- Better mobile web layout for quick edits from a phone browser.
- Pack duplicate/clone flow for remixing existing packs.
- Activity feed showing who changed pack metadata or images.

## Media Editing

- Web editor with pan/zoom crop, background removal, outline/stroke, shadow, and transparent background preview.
- Android editor with pan/zoom crop and live output size estimate.
- Batch image normalization before upload.
- Duplicate sticker detection using perceptual hashes.
- Animated sticker support as a separate opt-in pipeline.

## Collaboration

- Invite users to a pack as viewer, editor, or owner.
- Shared team/workspace model for family or community packs.
- Comments or review status per sticker.
- Public share page for a pack with install instructions.
- Optional approval flow before a sticker becomes part of an exported pack.

## Android

- Settings screen for server URL, account state, cache usage, and logout.
- Friendly empty/error states for login, sync, WhatsApp missing, and invalid packs.
- Local sticker grid preview before importing into WhatsApp.
- Manual cache cleanup and resync controls.
- Support WhatsApp Business import target.
- Real-device compatibility pass against WhatsApp's official sample behavior.

## Backend

- Swagger/OpenAPI docs.
- Refresh-token auth and session revocation.
- Invite-only registration mode.
- Rate limits for auth and upload endpoints.
- Stronger upload inspection for image bombs and malformed files.
- Pack manifest endpoint with ETag support.
- Background media processing queue for heavier transforms.
- Audit log for sensitive actions.

## Web App

- Admin settings page for registration mode, quotas, and instance branding.
- User profile and password change flows.
- Public pack browser for visible packs.
- Drag-and-drop upload zone with progress per file.
- Keyboard shortcuts for review and ordering workflows.
- Optimistic UI updates with rollback on API failure.

## Sync And Reliability

- Content hash based on tray icon and sticker hashes.
- Metadata-only sync before downloading ZIP exports.
- Resumable or retry-safe Android downloads.
- Cleanup of local Android cache when server access is removed.
- Server-side pack export cache invalidated by `imageDataVersion`.

## Deployment And Ops

- Caddy, Nginx Proxy Manager, and Traefik examples.
- Compose `.env` template with production-safe defaults.
- Container healthchecks for web and backend.
- Backup verification script for PostgreSQL and `/data`.
- Optional S3-compatible storage backend.
- Metrics endpoint for basic monitoring.

## Release And Quality

- Web lint and format scripts.
- Android lint in CI.
- Backend integration tests for the full WhatsApp-compatible export path.
- Playwright smoke tests for the web UI.
- Dependabot or Renovate.
- Release notes polish with screenshots or APK install notes.
