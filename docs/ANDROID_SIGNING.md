# Android Release Signing

StickerFoundry can build a signed release APK when signing environment variables are provided.

Do not publish a signed release until the Android package identity is finalized. The current starter app still uses:

```kotlin
applicationId = "com.example.stickerplatform"
```

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

cd apps/android
./gradlew :app:assembleRelease
```

The signed APK is written under:

```text
apps/android/app/build/outputs/apk/release/
```

## GitHub Actions Secrets

When package identity is finalized, store these as repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Then add a release workflow step that decodes the keystore, sets `ANDROID_KEYSTORE_PATH`, and runs `./gradlew :app:assembleRelease`.
