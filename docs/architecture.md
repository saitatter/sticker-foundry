# Sticker Foundry architecture

## Runtime topology

The API and queue worker are two processes built from the same NestJS backend image. PostgreSQL stores application state, Redis backs BullMQ, and the storage module selects disk or S3 for binary assets.

```text
Browser (React/Vite)
        │ REST + HttpOnly refresh cookie
        ▼
NestJS API ─────── PostgreSQL
    │
    └── BullMQ ─── Redis ─── NestJS worker
                       │
                       └── disk/S3 storage
```

## Web data flow

- TanStack Router owns route and search-parameter state.
- TanStack Query owns instance, user, packs, teams, admin, and job server state.
- `lib/api/http.ts` owns credentials, bearer headers, refresh retry, blob responses, and structured `ApiError` values.
- Feature API modules wrap the compatibility client while endpoint migration continues.
- Access tokens are memory-only. The refresh token is an HttpOnly cookie when cookie auth is enabled.

## Media and jobs

Queued sticker uploads first write an input object, then create a BullMQ media job. The worker validates/decodes the image, writes the processed output, updates the Prisma record, and cleans up temporary input. Job detail queries poll only while the job is non-terminal.

Pack covers are served from `/api/packs/:id/cover` and `/api/public/packs/:id/cover`. The URL is versioned with the pack image-data version and is safe to cache; the library no longer fetches pack details or first stickers as a fallback for every card.

## API contracts

Nest Swagger JSON is the contract source. With the API running, regenerate TypeScript definitions with:

```bash
npm run api:generate
```

The Android client keeps the existing endpoint names and response semantics. New cover endpoints are additive.
