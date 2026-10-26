# Copilot Instructions for Sticker Foundry

## Communication

- Raspunde in romana, concis si practic.
- Explica tradeoff-urile importante inainte de schimbari riscante.
- Nu inventa comportamente; verifica in cod, teste sau documentatie locala.

## Project Context

- Sticker Foundry is a self-hosted collaborative WhatsApp sticker pack manager with a NestJS backend, Flutter client for mobile, desktop and web.
- Monorepo managed with npm workspaces.
- Backend: `apps/backend` — NestJS, Prisma/PostgreSQL, JWT auth, media processing, ZIP exports.
- Client: `apps/client` - Flutter/Dart shared mobile, desktop and web UI.
- Android adapter: `apps/client/android` - Kotlin, SQLite cache, WhatsApp ContentProvider.
- Shared types: `packages/shared-types`.
- Docker: `docker-compose.yml` (source), with `docker-compose.dev.yml` and `docker-compose.ai.yml` as optional overrides.

## Git and Releases

- Use conventional commits. Examples:
  - `feat: add sticker text overlay`
  - `fix: correct export ZIP mime type`
  - `test: add brush compare e2e test`
  - `chore: update NestJS dependencies`
- `semantic-release` reads conventional commits from `release.config.cjs`.
- Do not manually edit generated release artifacts unless explicitly requested.
- Keep commits focused; do not mix unrelated backend, web, and Android changes unless the feature requires it.

## TypeScript and Style

- Backend targets Node 22+ with NestJS conventions.
- Client uses Dart and Flutter Material 3. Run `dart format` and `flutter analyze`.
- Prettier config lives in `.prettierrc.json` (120 width, single quotes, trailing commas).
- ESLint configs live per-app: `apps/backend/eslint.config.mjs`.
- Keep type hints on new public helpers and DTOs.

## Database and Migrations

- Prisma schema lives in `apps/backend/prisma/schema.prisma`.
- Run `npm run prisma:generate` after schema changes.
- Run `npm run prisma:migrate` to create new migrations.
- Keep seed data in `apps/backend/prisma/seed.ts`.

## Android

- Flutter UI; Kotlin only for the native Android bridge.
- Flutter owns cached exports; the Android bridge retains the existing SQLite schema for WhatsApp. The server is the source of truth.
- `ContentProvider` is required for WhatsApp integration; do not remove or rename it without understanding WhatsApp's query protocol.
- Gradle Kotlin DSL (`build.gradle.kts`).

## Testing

- Backend: `npm run test:backend` (unit), `npm run test:e2e:backend` (e2e).
- Web: `npm run test:web` (Playwright smoke flows).
- Android: `./gradlew :app:lintDebug` in `apps/client/android`.
- Add regression tests for bug fixes and new API endpoints.

## Docker

- `docker-compose.yml` is the supported source stack with separate postgres, redis, backend, worker, and web services.
- `docker-compose.dev.yml` adds MinIO and MailHog for local S3 and email testing.
- `docker-compose.ai.yml` overrides backend with AI background removal dependencies.

## When to Use Skills or Agents

- Use skills for repeatable workflows such as release preparation, migration patterns, testing checklists, or packaging checklists.
- Use agents only when the task benefits from isolation or parallelism, such as an independent review or research pass.
- Do not spawn agents by default; explain why they are useful before using them.
