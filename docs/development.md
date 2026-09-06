# Development workflow

## Install and run

```bash
npm ci
npm run prisma:generate
npm run dev
```

The development stack expects PostgreSQL and Redis. The base Compose file starts both plus the API, worker, and web services:

```bash
docker compose up -d --build
```

If Docker Desktop is unavailable, run the web unit and mocked browser tests locally; queue-backed tests need Redis and PostgreSQL.

## Quality gates

```bash
npm run build:shared-types
npm run build:backend
npm run build:web
npm run lint:backend
npm run lint:web
npm run test:backend
npm run test:e2e:backend
npm run test:web:unit
npm run test:web -- --project=chromium
```

Playwright is configured for Chromium, Firefox, and WebKit. The full browser matrix is:

```bash
npm run test:web
```

## API generation

Start the backend, then run `npm run api:generate`. The generated file is written to `apps/web/src/lib/api/generated/schema.d.ts`; CI can compare it with the committed contract output.

## Security configuration

Production must set an explicit comma-separated `CORS_ORIGIN` allowlist. Refresh-cookie settings are controlled by `AUTH_REFRESH_COOKIE_*`; use `AUTH_REFRESH_COOKIE_SECURE=true` behind HTTPS. Do not put access or refresh tokens in browser storage.
