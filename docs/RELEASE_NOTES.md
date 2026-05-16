# Release Notes Guide

Semantic-release generates the changelog and GitHub Release body from Conventional Commits. Use this guide when preparing a release PR or reviewing the generated GitHub Release.

## Screenshots To Capture

Add screenshots to the release description when a release changes visible workflows:

- Web pack list and detail view.
- Sticker editor with review status, comments, and image edit controls.
- Public share page for a pack.
- Android pack list after sync.
- Android WhatsApp import confirmation flow.
- Admin/account dialog if settings changed.

Keep screenshots focused on the feature, with test data only.

## APK Install Notes

GitHub Releases attach `Sticker Foundry Android debug APK` as an early tester artifact.

Tester flow:

1. Download `app-debug.apk` from the GitHub Release assets.
2. Install it on an Android device that has WhatsApp or WhatsApp Business installed.
3. Open Sticker Foundry and set the API URL to the deployed backend.
4. Log in, sync packs, then use `WhatsApp` or `Business` from a synced pack card.
5. Accept WhatsApp's import confirmation.

Known debug APK caveats:

- The APK is unsigned for Play Store distribution.
- Android may require allowing installs from the browser or file manager.
- Package identity may change before signed release builds are finalized.
- Real WhatsApp validation should mention tested Android, WhatsApp, and WhatsApp Business versions.

## Release Body Polish

Before sharing a release widely, make sure the generated notes include:

- User-facing highlights first.
- Migration or deployment notes when env vars, Docker, PostgreSQL, or Room schemas changed.
- Android install notes when the APK behavior changed.
- Screenshots for major web or Android UX changes.
- A short known-issues section for anything intentionally unfinished.
