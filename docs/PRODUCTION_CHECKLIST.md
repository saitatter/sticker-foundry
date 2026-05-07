# StickerFoundry HTTPS-First Production Checklist

Use this before exposing StickerFoundry outside your LAN.

## Network

- Put the web UI and API behind HTTPS with a trusted certificate.
- Route `/api/*` to the backend and all other paths to the web container.
- Keep PostgreSQL private on the Docker network; do not publish port `5432` publicly.
- Set `PUBLIC_BASE_URL` to the public API origin.
- Set `PASSWORD_RESET_PUBLIC_URL` to the public web origin.
- Restrict `CORS_ORIGIN` to your public web origin instead of `*`.

## Secrets

- Replace the default `JWT_SECRET` with a long random value.
- Replace the default `POSTGRES_PASSWORD`.
- Store SMTP and S3 credentials in Unraid/Docker secrets or private env files.
- Keep `.env` out of git.

## Authentication

- Prefer `REGISTRATION_MODE=invite-only` or `disabled` for public deployments.
- Rotate the registration invite code after initial setup.
- Review admin users after the first-user bootstrap.

## Storage And Backups

- Persist PostgreSQL and `/data` on durable volumes.
- Back up both PostgreSQL and `/data` together.
- Verify backups with:

```bash
npm run verify:backup -- --postgres stickers.sql --data foundry-data.tgz
```

- Test a restore on a separate machine or temporary stack.
- If using S3-compatible storage, verify bucket lifecycle, credentials, and restore access.

## Observability

- Monitor `/api/health`.
- Use `/api/metrics?format=prometheus` for Prometheus text format.
- Watch disk usage for PostgreSQL, `/data`, and export cache.
- Configure `AUDIT_RETENTION_DAYS` to fit your compliance and storage needs.

## Updates

- Pull releases through a branch/PR workflow.
- Run database migrations before serving traffic.
- Keep a tested rollback plan and recent backup before updating.
