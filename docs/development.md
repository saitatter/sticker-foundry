# Development

Install Flutter 3.47.7, Python 3.13, uv, Docker Compose and Node.js 22. Run `npm ci`, `uv sync --project apps/backend --locked`, and `flutter pub get` in `apps/client`.

## API and workers

Copy `.env.example` to `.env` with isolated development credentials. Run `docker compose up -d postgres redis`. Initialize an empty development database with `uv run --project apps/backend python -m foundry.db_init`. Start the API with `uv run --project apps/backend uvicorn foundry.main:app --app-dir apps/backend --port 3000 --reload`.

In separate terminals run `uv run --directory apps/backend python -m foundry.worker --queue media` and equivalents for `export` and `email`. Alternatively run `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` for a full stack with API reload.

OpenAPI: `/api/docs` and `/api/openapi.json`. Register through the UI; no account is seeded.

## Client and device

From `apps/client`, run `flutter run -d chrome`, `flutter run -d windows` or another target. Set the API URL on the login screen. For browser tools build `flutter build web --release --no-web-resources-cdn`, then run `npm run preview:web` from the root.

For Android install JDK 17 and the Android SDK, enable USB debugging, accept authorization and check `adb devices`. Use `adb reverse tcp:8080 tcp:8080` when Docker web uses host port 8080, and set the device API to `http://127.0.0.1:8080/api`. Build with `flutter build apk --debug`, then `adb install -r build/app/outputs/flutter-apk/app-debug.apk`. Follow WhatsApp validation for native imports.

## Checks

Run `dart run tool/ci_check.dart` before pushing. Add `--integration` for isolated Docker, PostgreSQL/Redis/Celery and browser acceptance against the web image built by Compose. No second host web build or preview server is needed. It removes only its unique test project. Never point tests or initialization at a real installation.

Focused checks: `uv run --project apps/backend pytest apps/backend/tests -m 'not integration'` and `uv run --project apps/backend ruff check apps/backend tool`. Run `flutter analyze` and `flutter test` in `apps/client`.

Keep captures in ignored `test-results/`. Use conventional commits with a body and a user-facing Unreleased entry. See the versioning policy.
