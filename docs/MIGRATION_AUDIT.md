# Flutter migration audit — 2026-10-26

The active UI is consolidated in Flutter. This is a migration branch with remaining parity and release gates; it is not evidence that every previous feature has passed acceptance testing.

## Cleaned in this audit

- Preserved the original artwork at `assets/brand/sticker-foundry-icon.png`. Its Git blob is unchanged from `main` (`d17dc05a3d0aa38ba381edab4865cc28d4f346e3`).
- Replaced Flutter placeholder icons on macOS/iOS, incorrect PWA sizes and maskable icons, and the generic login symbol. Windows now includes multiple icon sizes; Linux includes its icon and desktop entry. Android launcher/adaptive assets remain unchanged.
- Added `apps/client/tool/sync_brand.dart`: `npm run brand:sync` generates the required sizes from the original artwork; `npm run brand:check` verifies all 34 outputs. This changes image sizes/containers, not the logo design.
- Updated `.gitignore` for Flutter/native artifacts, local signing keys, Python caches and the production environment template. Added 22 positive/negative ignore checks; lockfiles, wrapper JAR and source assets stay tracked.
- Reduced Docker contexts by excluding native build/tool caches, credentials and archived clients. Added the Flutter brand asset to Docker and the server archive.
- Removed the obsolete Vite/React Dependabot group; enabled Dart dependency updates. Removed the unused direct web/axe dependencies, retained Cupertino icon fonts required by adaptive Flutter widgets, and declared the backend lint dependencies explicitly. The backend had relied on ESLint from the archived web workspace.
- Aligned Node tooling/images with Node 22 and switched backend images to `npm ci`. Added Flutter-specific command names while preserving existing npm aliases.
- Made Android artifact selection explicit (`npm run package:release -- --apk-mode=debug` or `--apk-mode=release`). A stale release APK can no longer silently override a newly requested debug APK.
- Corrected README/backlog claims about drag-and-drop, keyboard shortcuts, Docker availability and previous validation. Historical release/QA reports remain historical records.

## Required before treating the migration as release-ready

| Priority | Work                                             | Evidence / acceptance                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Finish the production dependency security review | Compatible lockfile updates removed the critical alert, but advisories remain; see the dependency section below. Test fixes against upload cancellation/limits, mail delivery, media decoding and migrations.                                                                                                                     |
| P1       | Complete previous web-route compatibility        | `ui/app.dart` lacks `/login`, `/app/packs`, `/app/packs/:id`, settings/team routes. `/app/packs/:id/:tab` currently ignores the requested section. Restore aliases/sections and test reload/back/forward.                                                                                                                         |
| P1       | Restore editor/list parity                       | `ui/pack.dart` supports Move earlier/later but no drag-and-drop; the earlier web shortcuts/presets/batch presets are not ported. `editor/image_editor.dart::_load` retains only the first animation frame and estimates duration; add live playback/scrubbing and accurate variable-frame timing.                                 |
| P1       | Expand real API client regression tests          | Nine mocked browser flows and seven Flutter tests cover a small part of the UI. Add collaboration/invite roles, comments, review permissions, teams/admin, password reset and session revocation, job cancellation/retry, export/share, interrupted sync and conflicts. Recheck AI and animation edits through the actual worker. |
| P1       | Run remote/platform CI                           | At audit start GitHub reported no PR or workflow runs for `feat/flutter-migration`. Jobs are configured for macOS/Linux/iOS, but only Android/Windows/web were built locally. CI now also supports manual dispatch.                                                                                                               |
| P1       | Validate distribution credentials and upgrades   | Test a signed release over an installed signed APK, WhatsApp Business, and static/animated import with the release certificate. Debug-device success does not validate release signing.                                                                                                                                           |
| P2       | Automate desktop distribution                    | Local Windows ZIP exists; semantic-release currently publishes Android and server artifacts only. Add version-matched desktop artifacts and platform signing/notarization/installers as needed. Linux desktop entry/icon are bundled; desktop-menu installation still needs a distribution package.                               |
| P2       | Finish deployment acceptance                     | A local production-mode QA stack and Flutter Docker build were tested. Still exercise a clean source stack with the updated images/lockfile, external HTTPS/cookies, S3/SMTP and backup restore. Old published tags retain their released client until a new release is published.                                                |
| P2       | Remove archived clients                          | Keep `legacy` until parity/regression evidence is complete. It is already excluded from npm workspaces, Docker and active CI. Remove the archive in a focused commit afterwards; do not delete the canonical brand assets or Android provider adapter.                                                                            |

## Dependency audit

`npm audit --omit=dev` initially reported **13 affected production dependency records: 1 critical, 10 high and 2 moderate**. Compatible lockfile updates reduced that to **9: 0 critical, 7 high and 2 moderate**. The full development tree decreased from 33 to **12 records: 0 critical, 9 high and 3 moderate**, including the explicit lint tools.

Remaining production records: `@nestjs/platform-express` / `multer`, `prisma` / `@prisma/config` / `deepmerge-ts`, `@nestjs/swagger` / `js-yaml`, `nodemailer` and `sharp`. These are advisory findings, not proof that every vulnerable path is reachable from this application. Several proposed remedies cross the current dependency ranges; the automatic Nest downgrade recommendation must not be applied blindly.

Relevant primary advisory records include [Multer upload teardown](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [Sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [Nodemailer raw-message handling](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) and [deepmerge-ts recursion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Raw local audit output is in the ignored `test-results` directory. This audit did not run `npm audit fix --force` or add transitive overrides.

## Reproduce the checks

This audit reran backend lint/build, all 83 backend tests plus the integration test, Flutter analysis and seven tests, all nine browser tests (including the original logo), Android APK/lint and Windows/web release builds. Both backend (Node 22) and Flutter Docker images built; the backend image encoded a 512×512 WebP successfully. Repository/brand checks passed, and packaging selected the current debug APK while a stale release fixture existed. The APK was updated on the connected phone. These local checks do not close the platform/distribution and functional-parity gaps above.

```sh
npm ci
cd apps/client
flutter pub get
cd ../..
npm run repo:check
npm run brand:check
npm run lint:client
npm run test:client
npm run lint:backend
npm run build:backend
npm run test:backend
npm run test:e2e:backend
npm run compose:validate
npm run build:web
npm run test:web
npm audit --omit=dev
```

The last command currently exits nonzero because the remaining advisories are unresolved. Flutter builds require the platform toolchains described in [development](development.md) and [migration QA](FLUTTER_MIGRATION.md). The server archive is a Docker deployment package, not a full developer checkout.
