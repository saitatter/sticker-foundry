# Sticker Foundry client

Flutter application shared by Android, web, Windows, macOS, Linux and iOS.

```sh
flutter pub get
flutter run -d windows
flutter run -d chrome --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/
flutter build apk --debug
flutter build web --release --no-web-resources-cdn
flutter analyze
flutter test
```

Native builds default to `http://127.0.0.1:8080/api/`. Change **Server connection** to a LAN address, or use `adb reverse tcp:8080 tcp:8080` over USB. The web build defaults to `/api/` on its own origin.

Android retains `com.stickerfoundry.app` and the existing WhatsApp ContentProvider authority. Release APKs require the existing signing environment variables; release builds never use the debug signing key.

See [migration details](../../docs/FLUTTER_MIGRATION.md) for supported workflows and validation.
