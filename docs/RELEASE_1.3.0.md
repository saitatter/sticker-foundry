# Sticker Foundry v1.3.0

Sticker Foundry v1.3 brings the web workspace and Android app much closer together, with faster syncing, clearer pack management, and a more reliable WhatsApp workflow.

## Highlights

### A better Android workspace

- Separate login, Home, Packs, and Settings areas.
- Immich-inspired mobile navigation with a profile menu and categorized settings.
- Persistent light and dark themes, including correct status-bar and safe-area colors.
- Improved branding and adaptive app icon with less empty space.
- Android pack views now include editing, comments, collaboration, activity, settings, export, and sync workflows.

### Reliable sync across devices

- Pack and sticker changes now invalidate cached data automatically.
- Updated sticker images and tray icons refresh without manually clearing the browser cache.
- Android sticker previews fall back to the server when a local copy is not available.
- Pack image data versions keep WhatsApp content synchronized after edits.

### WhatsApp improvements

- WhatsApp import buttons now provide visible feedback when a pack is not synced, has an invalid sticker count, or WhatsApp is unavailable.
- Sticker Foundry packs already added to WhatsApp can be detected and opened directly from the app.
- Editing a pack keeps the same provider identity and updates its image data version so WhatsApp can refresh it.
- The same workflow is available for WhatsApp Business.

### Activity and audit history

- New pack, sticker, collaboration, invite, and comment events include before/after snapshots.
- Existing metadata-only events show their recorded event data instead of two empty panels.
- Activity history supports pagination, individual entry deletion, and Clear all for pack managers.

### Web workspace polish

- Improved pack navigation, search, theme persistence, and responsive layouts.
- Toast notifications stack without moving the page and disappear automatically.
- Sticker previews, selection, editing, ordering, and WhatsApp-related states are more consistent across the workspace.

## Android installation

1. Download `sticker-foundry-android.apk` from the assets below.
2. Allow installation from the browser or file manager when Android asks.
3. Open Sticker Foundry, set the server URL, and sign in.
4. Sync a pack before using the WhatsApp import action.

The server package is available as `sticker-foundry-server-package.tar.gz`.

## Known limitations

- The attached APK is an unsigned debug build for testing, not a Play Store release.
- WhatsApp packs must contain between 3 and 30 stickers.
- Sticker Foundry can detect and update packs provided by its own content provider. Packs installed by other apps cannot be edited or deleted through WhatsApp's public sticker integration.
- Old audit entries that were created without metadata cannot be reconstructed with historical before/after values.
