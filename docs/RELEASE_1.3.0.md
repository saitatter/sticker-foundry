## What's Changed

Sticker Foundry 1.3.0 brings the web workspace and Android app together with a clearer mobile layout, faster cross-device sync, a more reliable WhatsApp workflow, and published split container packages for the current Docker Compose stack.

### ✨ Features

* **android:** Added a login-first workspace with Home, Packs, and Settings areas, an Immich-inspired layout, profile menu, categorized settings, persistent themes, safe-area handling, and refreshed branding. ([98d46ea](https://github.com/saitatter/sticker-foundry/commit/98d46eacefbf6cf1090b396e6a8a2aa380b78782), [b3c799e](https://github.com/saitatter/sticker-foundry/commit/b3c799e0aeb035ba979d1ccdc3b159302f383395), [ed726de](https://github.com/saitatter/sticker-foundry/commit/ed726debd597327c6e47420d733b87109fd30503))
* **android:** Added mobile pack editing, comments, collaboration, activity, settings, export, sync, and WhatsApp workflows. ([7ca59c9](https://github.com/saitatter/sticker-foundry/commit/7ca59c9eb74f8f935d25bb661f02ed20c727d68b), [c4ba874](https://github.com/saitatter/sticker-foundry/commit/c4ba8740662518b9dd499ba4e96efaa2ddc9be45))
* **sync:** Added automatic cache invalidation for pack, sticker, tray-icon, and WhatsApp image updates across browser and Android clients. ([30eb942](https://github.com/saitatter/sticker-foundry/commit/30eb9424ce55c481fb0e069e65774d532601b2d0), [c4ba874](https://github.com/saitatter/sticker-foundry/commit/c4ba8740662518b9dd499ba4e96efaa2ddc9be45))
* **activity:** Added before/after snapshots, pagination, individual deletion, and Clear all controls for pack activity and audit history. ([c4ba874](https://github.com/saitatter/sticker-foundry/commit/c4ba8740662518b9dd499ba4e96efaa2ddc9be45), [c67a07b](https://github.com/saitatter/sticker-foundry/commit/c67a07b66bdaf07b60ffc8a6d8bbeff2cae69df7))
* **docker:** Published separate backend and web container packages for the current Compose stack, with `latest`, `v1.3.0`, `1.3.0`, and `1.3` tags. ([docker-packages.yml](https://github.com/saitatter/sticker-foundry/blob/main/.github/workflows/docker-packages.yml))

### 🐛 Fixes

* **whatsapp:** Added visible feedback when a pack is not synced, has an invalid sticker count, or WhatsApp is unavailable, and support for recognizing Sticker Foundry packs already installed in WhatsApp and WhatsApp Business. ([c4ba874](https://github.com/saitatter/sticker-foundry/commit/c4ba8740662518b9dd499ba4e96efaa2ddc9be45))
* **android:** Fixed sticker previews that could show only a selection checkmark, stale tray icons, refresh-session failures, and adaptive-icon whitespace. ([30eb942](https://github.com/saitatter/sticker-foundry/commit/30eb9424ce55c481fb0e069e65774d532601b2d0), [ab668b0](https://github.com/saitatter/sticker-foundry/commit/ab668b07bffebc825e67d02ed83f4cfa350f5fdb))
* **web:** Stabilized browser sessions across refreshes and made toast notifications stack, animate, and dismiss automatically. ([9942cb2](https://github.com/saitatter/sticker-foundry/commit/9942cb2ab3f2fb1e47c49b337a25b02875f46289), [519ed58](https://github.com/saitatter/sticker-foundry/commit/519ed580978ec86ae51aff725e163d5d4111d721))
* **editor:** Made `rembg` the primary background-removal provider and disabled background sticker reordering while editing. ([7f307b5](https://github.com/saitatter/sticker-foundry/commit/7f307b51840ea3840cab864d7899333627960fce), [3662bfb](https://github.com/saitatter/sticker-foundry/commit/3662bfb57907fce1e0a1d6f22628e0e3b3bf7a7e))
* **release:** Fixed semantic-release preparation on Windows so the APK and server package can be generated reliably. ([069138b](https://github.com/saitatter/sticker-foundry/commit/069138bd57544ef8b024180c00488a777d6793f8))

### 📦 Release Assets

* `sticker-foundry-android.apk` - debug APK for device testing.
* `sticker-foundry-server-package.tar.gz` - source package with the web/API Compose stack and the published-image override.
* `ghcr.io/saitatter/sticker-foundry-backend:v1.3.0` - API and worker image with CPU AI background removal.
* `ghcr.io/saitatter/sticker-foundry-web:v1.3.0` - web application image.

### ⚠️ Notes

* The attached Android APK is a debug build because Android signing secrets are not configured yet.
* The 1.3.0 containers follow the current split Compose architecture. Use `docker-compose.yml` with `docker-compose.ghcr.yml`; the old 1.2.0 all-in-one image was removed with the previous deployment architecture.
* Pin `STICKER_FOUNDRY_IMAGE_TAG=v1.3.0` for this release, or use `latest` when you want the current published image.
* WhatsApp packs must contain between 3 and 30 stickers. Packs installed by other apps cannot be edited or deleted through WhatsApp's public sticker integration.

**Full Changelog**: https://github.com/saitatter/sticker-foundry/compare/v1.2.0...v1.3.0
