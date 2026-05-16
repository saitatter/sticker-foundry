# StickerFoundry On Unraid

The Unraid package uses one all-in-one application image:

- `ghcr.io/saitatter/sticker-foundry:latest`

That single container includes:

- Web UI through Nginx.
- Backend API on the same public port under `/api`.
- PostgreSQL stored inside `/data/postgres`.
- AI background removal through `rembg[cpu]`.

Use `docker-compose.packages.yml` for Unraid so the server pulls the prebuilt image instead of building locally.

## Recommended Share

Map one durable appdata directory:

- `/mnt/user/appdata/sticker-foundry/data`: PostgreSQL database, sticker files, exports, cache, and AI model cache.

The Compose file already maps it through:

```env
UNRAID_APPDATA=/mnt/user/appdata/sticker-foundry
```

## Ports

- Web UI and API: `8080:80`.
- API path: `http://YOUR_UNRAID_IP:8080/api`.
- PostgreSQL is internal to the container and is not exposed.

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

Optional package settings:

```env
STICKER_FOUNDRY_IMAGE=ghcr.io/saitatter/sticker-foundry
STICKER_FOUNDRY_IMAGE_TAG=latest
WEB_PORT=8080
```

AI background removal is enabled by default in the package image:

```env
BACKGROUND_REMOVAL_COMMAND=rembg i {input} {output}
```

Leave `BACKGROUND_REMOVAL_COMMAND` empty in `.env` if you want the Compose default to fill it in.

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

Update to the latest package:

```bash
docker compose -f docker-compose.packages.yml --env-file .env pull
docker compose -f docker-compose.packages.yml --env-file .env up -d
```

## Unraid Docker UI

If you prefer creating the container manually in the Unraid Docker UI, use:

- Repository: `ghcr.io/saitatter/sticker-foundry:latest`
- Container port `80` to host port `8080`.
- Container path `/data` to `/mnt/user/appdata/sticker-foundry/data`.

Required variables:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `PUBLIC_BASE_URL`
- `PASSWORD_RESET_PUBLIC_URL`
- `CORS_ORIGIN`

Recommended values for local LAN testing:

```env
PUBLIC_BASE_URL=http://YOUR_UNRAID_IP:8080/api
PASSWORD_RESET_PUBLIC_URL=http://YOUR_UNRAID_IP:8080
CORS_ORIGIN=http://YOUR_UNRAID_IP:8080
```

## Reverse Proxy

Use HTTPS through Nginx Proxy Manager, Caddy, Traefik, or the Unraid reverse proxy setup you already trust.

- Forward all traffic to container port `80` / host port `8080`.
- Keep `/api/*` on the same domain; the all-in-one image routes it internally.

See [REVERSE_PROXY.md](REVERSE_PROXY.md) for examples.

## Backups

Back up `/data` while the container is stopped, or dump PostgreSQL first and then archive `/data/app`:

```bash
docker compose -f docker-compose.packages.yml exec -T sticker-foundry pg_dump -U stickers stickers > stickers.sql
docker run --rm -v /mnt/user/appdata/sticker-foundry/data:/data -v "$PWD:/backup" alpine tar czf /backup/sticker-foundry-data.tgz -C /data .
```

Store backups outside the array or sync them to another machine.
