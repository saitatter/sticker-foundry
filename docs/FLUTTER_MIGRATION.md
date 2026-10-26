# Flutter client migration

The active client is `apps/client`: a shared Dart UI for Android, Windows and web, with macOS, Linux and iOS targets. NestJS, PostgreSQL, Redis and the media/queue workers remain the server. The React and Compose clients are archived under `legacy` and excluded from workspaces, deployment and CI.

For the current remaining work and repository cleanup, see [Migration audit](MIGRATION_AUDIT.md). The table below inventories the implemented client workflows; it does not assert complete parity with the archived clients.

## Workflows moved

| Area | Flutter client |
| --- | --- |
| Accounts | Login, registration/invite code, refresh, logout, password reset/change, session list/revocation, server selection |
| Library | Search, static/animated/public/private filters, sorting, create/edit/delete/clone, public discovery/share routes |
| Stickers | Multiple image selection, upload jobs, replacement, emoji/accessibility/review, tray icon, reorder, multiselect, copy/move/delete |
| Image editor | Canvas crop handles, rotation, draggable text, erase/restore brushes, adjustments/grayscale, undo/redo, original comparison, zoom/pan, background removal and animation options |
| Collaboration | Comments, member roles/removal, invite creation/expiry/revocation/acceptance, activity/history deletion |
| Teams | Create/list teams, members and roles, create packs for a team |
| Administration | Instance name/description, registration policy/code, quotas, audit retention/list/export/cleanup, background removal status |
| Distribution | ZIP export/download/share, job progress/cancel/retry, offline pack downloads, Android WhatsApp/Business import |

All platform screens use Material 3. Phones use bottom navigation, desktop uses a navigation rail; secondary actions use tooltips and overflow menus. The editor keeps its image canvas central and its controls in a small bottom panel or desktop sidebar.

## Run and build

Use Flutter **3.47.7**, JDK **17**, and Node **22.14+** (22.x) or **24.10+**. Windows builds need Visual Studio C++ tools; Android builds need the Android SDK. Linux builds need GTK, clang, CMake, Ninja, pkg-config and libsecret development packages plus a running keyring for secure token storage. Apple builds require macOS/Xcode and platform signing for device distribution.

```sh
npm install
cd apps/client
flutter pub get
flutter run -d windows
flutter build apk --debug
flutter build windows --release
flutter build web --release --no-web-resources-cdn
```

Native API default: `http://127.0.0.1:8080/api/`. Use **Server connection** or `--dart-define=API_BASE_URL=https://your-server/api/`. Web defaults to its own `/api/`; Nginx proxies this to the backend and serves deep routes such as `/share/:id` and `/reset-password`. CanvasKit is bundled for self-hosted deployments.

```sh
docker compose up -d --build
# Or serve a prebuilt web client locally, proxying a running API:
node scripts/serve-client.mjs
```

The development preview accepts `PORT` and `API_ORIGIN`. Existing production GHCR tags still contain the earlier client until a new release is published; this branch does not publish or replace a remote installation.

## Android update compatibility

Package `com.stickerfoundry.app` and authority `com.stickerfoundry.app.stickercontentprovider` are preserved. SQLite retains the previous Room v8 schema. Only the small platform channel/provider/cache adapter remains Kotlin. Legacy encrypted session tokens are read through Android Keystore and erased only after successful secure Flutter persistence. The first successful migration resynchronizes exported packs for the new cache.

Updates require the same signing certificate as the installed app. Release signing uses `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; release builds do not use debug signing.

For USB testing, `adb reverse tcp:8080 tcp:8080` connects the phone's default URL to the PC. If the PC port is occupied, map to the actual server port instead. The physical QA setup used `adb reverse tcp:8080 tcp:8081`.

Offline files are scoped to the server/account, removed on sign-out/server/account change, and pruned when sync detects lost access. Tokens use secure native storage or web HttpOnly refresh cookies; web tokens are not persisted in local storage. ZIP extraction checks paths; the native installer also caps extracted size and replaces pack files transactionally.

## Validation on 2026-10-26

- Flutter analysis; seven API/session/cache and phone-sized widget tests for login and text editing/PNG export.
- Release web and Windows builds; Android debug APK and Android lint.
- Nine Playwright flows across Chromium, Firefox and WebKit: sign in/create/rename, phone-width public discovery, invalid credentials.
- Real local API/browser flow: login, pack creation, upload through the canvas text editor, processing completion, settings edit, member/activity screens and deletion of the temporary pack.
- Motorola Edge 70 / Android 16: update over the installed Compose app, session migration, sync, static WhatsApp import confirmation, animated WhatsApp preview/provider, offline library and sticker images, text/undo/redo in the native Flutter editor. No messages were sent.
- Backend: 83 unit tests, integration test, lint/build; Compose validation; Flutter Nginx Docker image built and started with a healthy API proxy.

macOS, Linux and iOS builds cannot be executed on the Windows workstation; CI has platform jobs for them. WhatsApp integration is Android-specific; other platforms export/share ZIPs. Local raster edits of animations have a frame/memory limit and show an explicit error rather than flattening animation. AI background removal depends on the existing server configuration. The browser tests mock API responses; the real API and physical checks above are separate.

Generated local screenshots and scripts are in `test-results`; Playwright only clears `test-results/playwright`. An earlier test run cleared the old physical-test screenshots before the output directories were separated; the previous tracked QA report remains available.
