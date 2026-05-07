# StickerFoundry On Unraid

This project ships a Compose setup with three services: PostgreSQL, backend API, and web UI.

## Recommended Shares

- `appdata/sticker-foundry/postgres`: PostgreSQL data.
- `appdata/sticker-foundry/data`: sticker packs, tray icons, exports, and export cache.
- `appdata/sticker-foundry/env`: private `.env` file if you manage Compose outside the Unraid template UI.

## Volume Mapping

Map the Compose volumes to durable Unraid paths:

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
