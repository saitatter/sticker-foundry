# Docker And Unraid Validation

Docker is not available in the current local workspace, so use this checklist on a Docker host or Unraid box.

## Clean Compose Boot

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

## API Checks

```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/docs-json >/tmp/stickerfoundry-openapi.json
curl -fsS "http://localhost:3000/api/metrics?format=prometheus" | head
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

- Bind `postgres-data` to `/mnt/user/appdata/sticker-foundry/postgres`.
- Bind `foundry-data` to `/mnt/user/appdata/sticker-foundry/data`.
- Keep PostgreSQL private on the Docker network.
- Put the web UI behind HTTPS before remote access.
- Route `/api/*` to backend port `3000` and all other paths to web port `8080`.
