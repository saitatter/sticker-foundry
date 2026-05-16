# StickerFoundry On Unraid

This project ships a Compose setup with three services: PostgreSQL, backend API, and web UI.

The easiest Unraid path is to use the prebuilt GitHub Container Registry images:

- `ghcr.io/saitatter/sticker-foundry-backend:latest`
- `ghcr.io/saitatter/sticker-foundry-web:latest`
- Optional AI remover: `ghcr.io/saitatter/sticker-foundry-backend-ai:latest`

Use `docker-compose.packages.yml` for Unraid so the server pulls images instead of building them locally.

## Recommended Shares

- `appdata/sticker-foundry/postgres`: PostgreSQL data.
- `appdata/sticker-foundry/data`: sticker packs, tray icons, exports, and export cache.
- `appdata/sticker-foundry/env`: private `.env` file if you manage Compose outside the Unraid template UI.

## Volume Mapping

`docker-compose.packages.yml` already maps durable host paths using `UNRAID_APPDATA`:

```env
UNRAID_APPDATA=/mnt/user/appdata/sticker-foundry
```

If you use the build-from-source `docker-compose.yml`, map the Compose volumes to durable Unraid paths:

```yaml
volumes:
  postgres-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/appdata/sticker-foundry/postgres
  foundry-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/appdata/sticker-foundry/data
```

## Ports

- Web UI: `8080:80`
- Backend API: `3000:3000`
- PostgreSQL: keep internal only when possible. If you expose `5432`, restrict it to trusted hosts.

## Required Environment

Set these before first boot:

```env
POSTGRES_PASSWORD=replace-with-a-long-random-password
JWT_SECRET=replace-with-a-long-random-secret
PUBLIC_BASE_URL=https://stickers.example.com/api
PASSWORD_RESET_PUBLIC_URL=https://stickers.example.com
CORS_ORIGIN=https://stickers.example.com
REGISTRATION_MODE=invite-only
REGISTRATION_INVITE_CODE=replace-with-private-invite-code
```

Optional image settings:

```env
STICKER_FOUNDRY_IMAGE_TAG=latest
WEB_PORT=8080
BACKEND_PORT=3000
```

## Compose Manager Quick Start

1. Create `/mnt/user/appdata/sticker-foundry/.env` from `.env.example`.
2. Change `POSTGRES_PASSWORD`, `JWT_SECRET`, and the public URL/CORS values.
3. In Unraid Compose Manager, point the stack at `docker-compose.packages.yml`.
4. Start the stack.
5. Open `http://YOUR_UNRAID_IP:8080`.

CLI equivalent:

```bash
cd /mnt/user/appdata/sticker-foundry
docker compose -f docker-compose.packages.yml --env-file .env up -d
```

For AI background removal:

```bash
docker compose -f docker-compose.packages.yml -f docker-compose.packages.ai.yml --env-file .env up -d
```

## Unraid Docker UI Images

If you prefer creating containers manually in the Unraid Docker UI, use:

- Backend repository: `ghcr.io/saitatter/sticker-foundry-backend:latest`
- Web repository: `ghcr.io/saitatter/sticker-foundry-web:latest`
- PostgreSQL repository: `postgres:16-alpine`

Backend mappings:

- Container port `3000` to host port `3000`.
- Container path `/data` to `/mnt/user/appdata/sticker-foundry/data`.
- `DATABASE_URL=postgresql://stickers:<password>@postgres:5432/stickers?schema=public`.

Web mapping:

- Container port `80` to host port `8080`.

## Reverse Proxy

Use HTTPS through Nginx Proxy Manager, Caddy, Traefik, or the Unraid reverse proxy setup you already trust.

- Route `/api/*` to backend port `3000`.
- Route all other paths to web port `8080`.
- Enable WebSocket support only if your proxy requires it for long-lived HTTP streams.

See [REVERSE_PROXY.md](REVERSE_PROXY.md) for concrete examples.

## Backups

Back up both PostgreSQL and `/data` together:

```bash
docker compose exec -T postgres pg_dump -U stickers stickers > stickers.sql
docker run --rm -v sticker-foundry_foundry-data:/data -v "$PWD:/backup" alpine tar czf /backup/foundry-data.tgz -C /data .
npm run verify:backup -- --postgres stickers.sql --data foundry-data.tgz
```

Store backups outside the array or sync them to another machine.
