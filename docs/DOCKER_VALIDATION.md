# Docker And Unraid Validation

Docker is not available in the current local workspace, so use this checklist on a Docker host or Unraid box.

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
- `web` is running.

## Unraid Package Boot

The Unraid package uses one app container with web, API, PostgreSQL, and AI background removal included:

```bash
docker compose -f docker-compose.packages.yml --env-file .env up -d
docker compose -f docker-compose.packages.yml ps
docker compose -f docker-compose.packages.yml exec sticker-foundry rembg --help
```

Expected:

- `sticker-foundry` is healthy.
- Admin settings show AI background removal as configured.
- PostgreSQL data persists under `/data/postgres`.

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
curl -fsS http://localhost:3000/api/docs-json >/tmp/stickerfoundry-openapi.json
curl -fsS "http://localhost:3000/api/metrics?format=prometheus" | head
```

For the all-in-one package, use port `8080`:

```bash
curl -fsS http://localhost:8080/api/health
curl -fsS http://localhost:8080/api/docs-json >/tmp/stickerfoundry-openapi.json
curl -fsS "http://localhost:8080/api/metrics?format=prometheus" | head
```

Expected:

- health returns OK JSON.
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

## Unraid Notes

- Use `ghcr.io/saitatter/sticker-foundry:latest`.
- Bind `/data` to `/mnt/user/appdata/sticker-foundry/data`.
- Keep PostgreSQL internal to the all-in-one container.
- Put the web UI behind HTTPS before remote access.
- Route all traffic to web port `8080`; `/api/*` is routed internally.
