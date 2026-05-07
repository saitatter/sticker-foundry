# StickerFoundry Implementation Plan

This document tracks what is still meaningful to validate or decide. Implemented product work has been removed from this plan so it does not drift.

## Current State

- Backend, web, Android, Docker files, semantic-release, and operational docs are implemented as a usable starting project.
- Backend exports are cached and available through manifest/ETag-aware sync.
- Backend media processing supports static and animated WebP normalization, animated trim/FPS resampling, server-side threshold background removal, and optional self-hosted AI background removal through `BACKGROUND_REMOVAL_COMMAND`.
- Android caches packs locally, tracks extraction status, rejects stale edits through server-side version checks, and supports upload-time crop, rotation, color adjustment, grayscale, and text overlay edits.
- Web supports collaboration, public pack browsing, keyboard shortcuts, responsive sticker workflows, advanced sticker editing, batch presets, size warnings, and before/after compare.
- Web editor coverage includes focused Playwright tests for brush/compare, optimizer/background upload options, and animated trim/FPS option submission.

## Milestone 1: Real WhatsApp Validation

Goal: prove the Android bridge against current real clients.

Tasks:

- Install the debug APK on a physical Android phone.
- Point Android settings at a LAN or HTTPS backend.
- Sync a pack with at least 3 exportable stickers.
- Import into WhatsApp.
- Import into WhatsApp Business.
- Compare provider columns and URI behavior against WhatsApp's official Android sample.
- Document tested Android, WhatsApp, and WhatsApp Business versions.

Acceptance criteria:

- A synced pack imports successfully into WhatsApp.
- A synced pack imports successfully into WhatsApp Business.
- Any compatibility issue is fixed or tracked.

## Milestone 2: Deployment Validation

Goal: prove the default self-hosted stack boots cleanly on a Docker host.

Tasks:

- Run `docker compose up -d --build` on a machine with Docker installed.
- Confirm web, backend, PostgreSQL healthchecks, `/api/health`, `/api/docs`, and `/api/metrics?format=prometheus`.
- Create a pack, upload 3 stickers, export ZIP, and sync from Android.

Acceptance criteria:

- Default Compose stack works from a clean checkout.
- Any missing env, permission, migration, or volume issue is documented or fixed.

## Milestone 3: Android Release Signing

Goal: prepare Android releases for real distribution.

Tasks:

- Confirm ContentProvider authority on a real WhatsApp import after signing.
- Configure signing secrets for CI once identity is final.
- Build and test a signed release APK.

Acceptance criteria:

- Signed APK installs cleanly over future releases.
- WhatsApp import still works with the final provider authority.

## Milestone 4: Packaged AI Background Removal

Goal: make AI background removal turnkey instead of command-configurable only.

Tasks:

- Validate the optional `docker-compose.ai.yml` CPU image on a Docker host.
- Compare bundled `rembg` quality, CPU/RAM use, and image size against other ONNX/RMBG/U2-Net/MODNet style options.
- Keep the admin/web status indicator aligned with the packaged runtime.
- Keep threshold fallback as the default degraded mode.

Acceptance criteria:

- A clean self-hosted deployment can enable AI background removal without custom scripting.
- Missing model/runtime is visible to admins and does not break uploads.

## Milestone 5: Android Editor Parity

Goal: bring the Android upload editor closer to the web editor without bloating the WhatsApp bridge.

Tasks:

- Render color/text output in the Android preview before upload.
- Add manual eraser and restore brush with local undo/redo.
- Add Android controls for server threshold/AI background removal.
- Add animated trim duration and FPS controls.
- Add reusable batch presets for repeated uploads.

Acceptance criteria:

- Android can handle the common mobile-only editing path without needing the web app.
- Edited uploads remain server-validated and WhatsApp-compatible after backend processing.

## Design Notes

- Server remains the source of truth.
- Android remains a cache and WhatsApp bridge.
- `ContentProvider` is required because WhatsApp imports pack metadata and sticker files by querying the sticker app.
- `contentHash` is preferred for StickerFoundry sync decisions; `imageDataVersion` remains for WhatsApp compatibility.
- Static and animated packs stay separate because WhatsApp validation rules differ.
