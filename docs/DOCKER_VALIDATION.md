# Docker Validation

Docker is not available in the current local workspace, so use this checklist on a host with Docker installed.

## Source Compose Boot

```bash
cp .env.example .env
# edit POSTGRES_PASSWORD and JWT_SECRET first
docker compose up -d --build
docker compose ps
```

Expected:

- `postgres` is healthy.
- `backend` is running.
- `worker` is running and consumes media, export, and email queues.
- `web` is running.

## Development S3 And Email Services

Use the development override when testing the S3 storage adapter or password-reset delivery:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Expected:

- MinIO is available at `http://localhost:9001` with the credentials from `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.
- MailHog is available at `http://localhost:8025`.
- The backend and worker use the initialized MinIO bucket and reset messages appear in MailHog.

Stop the override with:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Storage Contract

Disk and S3 use the same layout: `<S3_PREFIX>/<packId>/cover.webp` for the tray icon and `<S3_PREFIX>/<packId>/stickers/<fileName>` for sticker files. `Sticker.storageKey`, `mimeType`, `width`, and `height` are required by the current schema. Check existing records and files before running `prisma:deploy`; the schema upgrade stops when any sticker metadata is incomplete.

## Optional AI Background Removal Boot

For source builds, the AI override builds a backend image with `rembg[cpu]` and sets `BACKGROUND_REMOVAL_COMMAND` automatically:

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.ai.yml exec backend rembg --help
```

Expected:

- backend starts successfully.
- Admin settings show AI background removal as configured.
- `Server bg: AI/fallback` uploads use the AI command or fall back to threshold if the model fails.

## API Checks

```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/health/live
curl -fsS http://localhost:3000/api/health/ready
curl -fsS http://localhost:3000/api/docs-json >/tmp/stickerfoundry-openapi.json
curl -fsS "http://localhost:3000/api/metrics?format=prometheus" | head
```

Expected:

- health returns OK JSON.
- `/api/health/live` reports process liveness without checking dependencies.
- `/api/health/ready` returns HTTP 503 when PostgreSQL, Redis, or the queue workers are unavailable.
- OpenAPI JSON downloads.
- Prometheus metrics are text and include process/application metrics.

## End-To-End Smoke

- Open `http://localhost:8080`.
- Register the first admin user.
- Create a static pack.
- Upload 3 stickers.
- Export ZIP.
- Configure Android to the backend URL.
- Sync the pack and attempt WhatsApp import.
