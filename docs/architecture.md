# Sticker Foundry architecture

## Runtime topology

The API and queue worker are two processes built from the same NestJS backend image. PostgreSQL stores application state, Redis backs BullMQ, and the storage module selects disk or S3 for binary assets.

```text
Flutter (Android / desktop / web)
        │ REST + HttpOnly refresh cookie
        ▼
NestJS API ─────── PostgreSQL
    │
    └── BullMQ ─── Redis ─── NestJS worker
                       │
                       └── disk/S3 storage
```

## Client data flow

- `apps/client/lib/ui` owns adaptive screens and GoRouter deep routes.
- `core/store.dart` owns session, library, jobs and account-scoped offline exports.
- `core/api.dart` owns multipart/JSON requests, token rotation with a shared refresh future, one replay after 401, and structured errors.
- Native tokens use secure platform storage; web access tokens remain in memory and refresh tokens use HttpOnly cookies.
- Android's small Kotlin adapter preserves the WhatsApp ContentProvider identity and SQLite schema. All application screens and image editing are Dart.
- ZIP downloads are cached on disk for native platforms and in IndexedDB on web. Account/server changes clear both Flutter and provider caches.

## Media and jobs

Queued sticker uploads first write an input object, then create a BullMQ media job. The worker validates/decodes the image, writes the processed output, updates the Prisma record, and cleans up temporary input. Job detail queries poll only while the job is non-terminal.

Pack covers are served from `/api/packs/:id/cover` and `/api/public/packs/:id/cover`. The URL is versioned with the pack image-data version and is safe to cache; the library no longer fetches pack details or first stickers as a fallback for every card.

## API contracts

Nest Swagger JSON is the contract source. With the API running, regenerate TypeScript definitions with:

```bash
npm run api:generate
```

The Android client keeps the existing endpoint names and response semantics. New cover endpoints are additive.
