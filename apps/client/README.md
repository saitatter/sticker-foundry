# Sticker Foundry client

Shared Flutter UI for Android, iOS, Windows, macOS, Linux and web. See [development](../../docs/development.md), [test recording](../../docs/testing.md) and [WhatsApp validation](../../docs/WHATSAPP_VALIDATION.md) for the current workflows.

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

Android retains `com.stickerfoundry.app` and its WhatsApp provider authority. Build a debug APK with `flutter build apk --debug`; for release builds configure the variables in [Android signing](../../docs/ANDROID_SIGNING.md), then run `flutter build apk --release`. Publish versions through the Release workflow.
