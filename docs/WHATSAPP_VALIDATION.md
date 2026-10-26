# Real WhatsApp Validation

Flutter debug validation on 2026-10-26 covered an update over the Compose app, session migration, sync, static WhatsApp import confirmation and animated pack preview/provider on Motorola Edge 70 / Android 16. No chat messages were sent. Signed release upgrades and WhatsApp Business remain unverified. See [migration QA](FLUTTER_MIGRATION.md) and the [migration audit](MIGRATION_AUDIT.md).

Use the checklist below for the remaining acceptance tests.

## Device Setup

- Install current WhatsApp from Google Play.
- Install current WhatsApp Business from Google Play.
- Install the Sticker Foundry APK.
- Point Android settings to a reachable HTTPS or LAN backend.
- Log in and sync a static pack with at least 3 exportable stickers.
- Sync an animated pack with at least 3 exportable animated stickers.

## Static Pack Import

- Open the static pack in Sticker Foundry Android.
- Tap `WhatsApp`.
- Confirm WhatsApp's import prompt.
- Confirm the pack appears in WhatsApp's sticker picker.
- Send at least one sticker in a chat.
- Repeat with `Business`.

## Animated Pack Import

- Open the animated pack in Sticker Foundry Android.
- Tap `WhatsApp`.
- Confirm WhatsApp's import prompt.
- Confirm animation previews play in WhatsApp's sticker picker.
- Send at least one animated sticker in a chat.
- Repeat with `Business`.

## Provider Compatibility

Record whether WhatsApp queries these provider paths successfully:

- `metadata`
- `stickers/<pack_id>`
- `stickers_asset/<pack_id>/<file_name>`

Record any missing columns, MIME type mismatches, URI permission failures, or package-specific behavior between WhatsApp and WhatsApp Business.

## Test Report Template

```text
Device:
Android version:
Sticker Foundry APK version:
WhatsApp version:
WhatsApp Business version:
Backend URL:
Static pack result:
Animated pack result:
Provider issues:
Notes:
```
