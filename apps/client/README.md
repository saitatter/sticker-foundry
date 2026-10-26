# Sticker Foundry client

Shared Flutter UI for Android, Windows and web, with macOS/Linux/iOS targets awaiting platform acceptance. See [migration audit](../../docs/MIGRATION_AUDIT.md) for parity gaps and [physical QA](../../docs/FLUTTER_MIGRATION.md) for tested workflows.

```sh
flutter pub get
flutter run -d windows
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/
flutter build apk --debug
flutter build web --release --no-web-resources-cdn
flutter analyze
flutter test
dart run tool/sync_brand.dart --check
```

Native builds default to `http://127.0.0.1:8080/api/`. Change **Server connection** to a reachable LAN/HTTPS address, or use `adb reverse tcp:8080 tcp:8080` over USB. Web defaults to `/api/` on its own origin. Windows, macOS and Linux builds require their native compiler tools; iOS requires macOS/Xcode.

The existing logo is the canonical repository asset `assets/brand/sticker-foundry-icon.png`. `dart run tool/sync_brand.dart` rebuilds platform sizes and copies the exact original into Flutter assets. Android launcher/adaptive icons retain their previous artwork. Do not hand-edit generated icon sizes or replace the canonical image as part of a routine Flutter upgrade.

Android retains `com.stickerfoundry.app` and its WhatsApp provider authority. Release APKs require the existing signing variables. From the repository root, `npm run package:release -- --apk-mode=release` selects that variant explicitly; the default is debug and does not fall back to a stale release file.
