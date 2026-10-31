# Test recording and device automation

Use `uv sync --project apps/backend --locked` for the Python tools. The normal gate is `dart run tool/ci_check.dart`; `--integration` also builds an isolated Docker stack, runs actual PostgreSQL/Redis/Celery acceptance and tests the served Flutter web image in three browser engines. Development fixtures never use a real installation's database.

## Browser tests

The eight scenarios in `apps/client/e2e/test_client.py` run in Chromium, Firefox and WebKit, giving 24 cases. They verify UI behavior against controlled API responses; backend tests and live Docker acceptance separately verify the actual server.

```sh
uv run --project apps/backend playwright install
uv run --project apps/backend pytest apps/client/e2e --browser chromium --browser firefox --browser webkit --tracing retain-on-failure --video retain-on-failure --screenshot only-on-failure --output test-results/playwright
```

Set `WEB_BASE_URL` to an existing test web origin. Without it, pytest starts a local Python preview of `apps/client/build/web`, which must already be built. The proxy API origin defaults to localhost:8080 and can be changed with `API_ORIGIN`. Traces, videos and screenshots stay in ignored `test-results/`.

For new browser scenarios, Playwright's interactive generator can produce Python directly:

```sh
uv run --project apps/backend playwright codegen --target python-pytest http://127.0.0.1:5173
```

Reuse the Flutter accessibility setup in `accessible(page)` from the existing tests when editing generated code. The Python package bundles Playwright's internal driver; there is no project TypeScript source, npm manifest or separate Node installation step.

## Android recording

The Python UI Automator runner operates through USB debugging. Enable debugging, authorize the computer on the phone and select the serial shown by `adb devices`. The first connection starts UI Automator's test component on the device. Keep the phone unlocked and use an isolated QA server/account.

Run these commands from the repository root. Replace `SERIAL` with the device identifier. Supply test credentials through environment variables `QA_EMAIL` and `QA_PASSWORD`, rather than writing them into scenarios.

```sh
uv run --project apps/backend python tool/phone_qa.py --serial SERIAL record qa/android/recorded/01-login.json --covers auth.login
```

The interactive prompt executes and records commands such as:

```text
launch
assert --label "Sign in"
input --label Email --env QA_EMAIL
input --label Password --env QA_PASSWORD
tap --label "Sign in"
assert --label "Your library"
save
```

`label` matches exact Android text or accessibility description. `--text`, `--description` and `--id` select a specific property; `--text-contains`, `--description-contains` and `--instance` refine compound or repeated labels. Prefer these over coordinates. For canvas edits use normalized coordinates, for example `swipe --start .3 .4 --end .6 .7` or `tap-point --point .5 .5`. `drag` uses a held drag for reorder handles; `long-tap` opens long-press interactions. Other commands include `absent`, `press --key back` and `checkpoint`.

Use `launch --restart` to restart the app without clearing its data. Switches and checkboxes can be asserted with `assert --description "Dark theme" --checked` or `--no-checked`. Password and other form inputs wait for focus and keyboard layout to settle before setting text. `open-link --env QA_RESET_LINK` opens an HTTP(S) link explicitly inside Sticker Foundry; the scenario keeps only the environment reference. This tests native routing, independently of the phone's default URL-handler associations.

This records actions executed through the runner; arbitrary taps made directly on the physical phone are not automatically converted into selectors. Each successful recorded step is written immediately. Assert the visible result of each operation so replay checks behavior rather than merely reproducing taps. `qa/android/login.json` contains the login selectors verified on the physical device. Commit scenarios only after their selectors and assertions have passed on the target phone; keep exploratory flows in ignored `test-results/`.

## Replay and evidence

```sh
uv run --project apps/backend python tool/phone_qa.py validate qa/android/login.json
uv run --project apps/backend python tool/phone_qa.py --serial SERIAL --video replay qa/android/login.json
```

A directory replays recorded scenarios in filename order and stops on the first failed scenario. The report marks later scenarios as not run. Every step retains its selector, assertion outcome, screenshot and redacted UI hierarchy restricted to allowed apps; the suite report includes each scenario's `covers` list. Environment references are saved instead of resolved secrets. Evidence is stored under `test-results/android/<session>/` by default; a new `--output` directory can be specified.

`--video` also records the Android screen, up to the platform's 180-second limit per scenario. Videos use a 720?1600 capture and a persistent ADB connection; missing or empty captures fail explicitly. Keep each feature scenario short; screenshots and action logs cover the entire run. Video and scenario replay on the physical device must be verified during the USB session. The runner does not reset application data, change the server database or select another app implicitly.

Generate synthetic upload fixtures with `uv run --project apps/backend python tool/phone_fixtures.py`, then copy each generated file into a dedicated `Download/Foundry-QA` folder with ADB (copying the whole directory again can create a nested folder). After copying, run `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/Foundry-QA/FILENAME` for each file so Android's image picker indexes it. Keep personal media out of recorded scenarios. Flutter inputs must be focused before setting text; the runner does this automatically. Actions wait for enabled controls and for overlapping system windows to clear, without changing notification settings. Videos can still contain notifications and remain private evidence.

For native WhatsApp import checks explicitly permit its package with `--allow-package com.whatsapp` (or `com.whatsapp.w4b` for Business). Add Android document-picker packages only when that tested flow needs them. Inspection and interaction stop outside allowed foreground packages. To inspect the current app's selectors:

```sh
uv run --project apps/backend python tool/phone_qa.py --serial SERIAL inspect
```

## Automated phone acceptance

`tool.phone_smoke` creates a unique test account and replays the reusable selectors in `tool/phone_scenarios.py`. It generates six synthetic PNG/GIF fixtures, copies them to `Download/Foundry-QA`, records each scenario separately and validates both export archives against the server. It checks the named Docker project, its API port, the internal PostgreSQL connection and its dedicated volume before creating test data.

Use a running Compose project named `sticker-foundry-device-qa` or `sticker-foundry-device-qa-<suffix>`. For a fresh lab, choose unused host ports and keep the same environment file between runs. For example, in PowerShell:

```powershell
$env:POSTGRES_HOST_PORT = '15434'
$env:REDIS_HOST_PORT = '16381'
$env:BACKEND_HOST_PORT = '13002'
$env:WEB_HOST_PORT = '18082'
docker compose --env-file .env.example -p sticker-foundry-device-qa-local up -d --build
```

Install the debug APK and select `http://127.0.0.1:13002/api/` in its server settings. The debug build lets the runner check that saved setting before launching the app. The runner maintains the USB API route during online scenarios and restores it after the offline check.

```sh
uv run --project apps/backend python -m tool.phone_smoke --serial SERIAL --project sticker-foundry-device-qa-local --video --whatsapp
```

The core flow covers login, static and animated uploads, batch edits, text/rotation/undo, metadata prefill and clearing, approvals and export restrictions, public navigation, archive saving, clone/copy/move, rename, search/filter/sort, theme changes, offline restart/reconnect and deletion. `--whatsapp` adds both native pack imports; omit it when WhatsApp is unavailable. `--keep-packs` retains the two base packs for inspection; temporary clone/transfer packs are still deleted. `--no-offline` skips the network interruption.

Generated credentials, exact JSON flows, per-scenario evidence and the aggregate report are private artifacts under `test-results/phone-smoke/<run>/`. The account is retained in the isolated QA database. Administrative, collaboration and email-recovery checks are exercised separately from this core suite; record their account/invite/link preconditions through environment references.

## Physical-device coverage

Pack layout checks should verify that the tray icon occupies its own centered row above three sticker columns on a phone. After opening an editable QA pack, `tool.phone_scenarios.reorder_current_pack(device, from_index=3, to_index=1)` builds a replayable gesture from the visible semantic bounds. Compare the server's ordered sticker IDs, restart the app and verify the order persists. Check empty-slot uploads and keep viewer controls read-only. Widget tests cover image dragging, drag-handle behavior, scrolling at the viewport edge, keyboard range selection and the mobile geometry.

Folder imports use `tool.phone_scenarios.folder_import_scenario` with fixtures generated by `python tool/phone_fixtures.py --import-folder --output test-results/import-fixtures`. Copy that folder into Downloads and pass its name and the storage-root label with `storage=` (`motorola edge 70` on the tested phone). The tree picker uses the device-storage root and its `Download` directory; its Downloads-provider root may not expose folders copied over USB. The scenario checks folder-picker cancellation, a mixed WebP preview, duplicate removal and completion; verify the resulting two packs and both export archives against the isolated API. The fixture set contains three static and three animated images, one identical copy, one invalid image and an unrelated text file.

When the installed app has a different signing certificate, preserve it and build a separate QA app. First run `flutter build apk --debug` from `apps/client`, then run `./gradlew :app:assembleDebug -PqaInstall=true` from `apps/client/android` (`gradlew.bat` in PowerShell). Install `apps/client/build/app/outputs/flutter-apk/app-debug.apk` after checking its package is `com.stickerfoundry.app.qa`. The launcher label is **Sticker Foundry QA**. Set `PHONE_QA_VARIANT=qa` for the Python phone runner, configure its isolated server separately and leave the regular app installed. Release builds keep the regular application/provider identity.

Record separate scenarios during the device session and list their feature IDs in `--covers`. A scenario definition alone is not a claim of physical-device coverage. The checked-in login and generated core selectors have been exercised on the connected phone; a run is verified only when its report and assertions pass.

| Area | Checks to record |
| --- | --- |
| Accounts | Server URL, registration, invalid credentials, login, logout, session revocation, password change/reset |
| Library | Create, search/filter, rename, clone, delete, public discovery and sharing |
| Media | Single/bulk upload, duplicates, static/animated constraints, tray changes, reorder and bulk metadata/review |
| Editor | Crop/rotate/pan, text, erase/restore, color effects, cutout, outline/shadow, presets, undo/redo and save |
| Animation | Preview/play/pause, frame timing, trim/FPS/quality and saved playback |
| Collaboration | Teams, invitations, roles, permission restrictions, comments, approvals and activity |
| Jobs/export | Progress, cancellation/retry, readiness, manifest and ZIP contents |
| Offline | Download, restart without network, account separation, resync, revoked access and cache cleanup |
| WhatsApp | Static/animated imports, update of downloaded packs, provider data and Business when installed |
| Administration | Instance settings, registration policy, quotas and audit access/cleanup |

The core suite does not cover every editor gesture or optional deployment feature. Advanced erase/restore and tray editing need separate phone scenarios; AI removal needs a configured service. WhatsApp Business and native desktop behavior require those targets to be available. Session revocation is also checked separately: revoking the current device must return it to sign-in, reject both access and refresh tokens, and leave other active devices usable. Password changes and resets must invalidate old access as well as refresh tokens.

Use [WhatsApp validation](WHATSAPP_VALIDATION.md) for the import checklist. Chat sending requires a specifically authorized test conversation; it is not part of the sample scenario.
