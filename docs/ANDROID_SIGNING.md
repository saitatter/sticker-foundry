# Android Release Signing

Sticker Foundry can build a signed release APK when signing environment variables are provided.

The Android package identity is:

```kotlin
applicationId = "com.stickerfoundry.app"
```

The WhatsApp `ContentProvider` authority is generated from that ID as `com.stickerfoundry.app.stickercontentprovider`.

## Create A Keystore

```bash
keytool -genkeypair \
  -v \
  -keystore sticker-foundry-release.keystore \
  -alias stickerfoundry \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Store the keystore outside git.

## Build A Signed APK

```bash
export ANDROID_KEYSTORE_PATH=/secure/path/sticker-foundry-release.keystore
export ANDROID_KEYSTORE_PASSWORD=replace-me
export ANDROID_KEY_ALIAS=stickerfoundry
export ANDROID_KEY_PASSWORD=replace-me

cd apps/client
flutter build apk --release
```

The signed APK is written under:

```text
apps/client/build/app/outputs/flutter-apk/
```

## GitHub Actions Secrets

Store these as repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The Release workflow decodes the keystore, sets `ANDROID_KEYSTORE_PATH`, and builds the signed release APK. When no keystore is configured it publishes an explicitly named debug APK. A debug APK cannot replace an installation signed with a release key.
