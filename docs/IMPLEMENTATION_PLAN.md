# StickerFoundry Implementation Plan

This plan tracks the current state of StickerFoundry and the next implementation milestones.

## Current Gaps

- Real-device WhatsApp and WhatsApp Business import still need hands-on validation.
- No background media queue, audit retention policy, or advanced upload abuse protection beyond current validation/rate limits.

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

## Milestone 2: Advanced Media Editing

Goal: reduce the need for external image tools.

Tasks:

- Validate animated sticker imports on real WhatsApp devices.

Acceptance criteria:

- Common sticker prep workflows are possible inside StickerFoundry.
- Duplicate or near-duplicate uploads can be warned or blocked.
- Static and animated pack metadata stays separate from upload through Android import.

## Milestone 3: Production Security

Goal: make internet-facing deployments safer.

Tasks:

- Add configurable audit retention cleanup.
- Add stricter image bomb safeguards and upload pixel limits.
- Add HTTPS-first deployment checklist.

Acceptance criteria:

- Public deployments have documented security controls.
- Abuse-prone uploads are bounded by documented limits and retention policies.

## Milestone 4: Release And Ops Quality

Goal: keep changes safer as the project grows.

Tasks:

- Add web lint/format scripts.
- Add release note polish with screenshots or APK install notes.
- Add Docker validation on an environment with Docker available.

Acceptance criteria:

- Pull requests cover backend, web, shared types, Android build, lint, and smoke tests.
- Release notes remain readable and useful.

## Near-Term Recommended Order

1. Real-device WhatsApp import validation.
2. Advanced media editing.
3. Real-device WhatsApp compatibility fixes discovered during validation.
4. Configurable audit retention cleanup.

## Design Notes

- Server remains the source of truth.
- Android remains a cache and WhatsApp bridge.
- `ContentProvider` is non-negotiable for WhatsApp integration because WhatsApp imports pack metadata and sticker files by querying the sticker app, not by reading remote URLs.
- `imageDataVersion` remains for WhatsApp compatibility, while `contentHash` is preferred for app sync decisions.
- Static and animated sticker packs remain separate because WhatsApp does not allow mixed packs and their validation rules differ.
