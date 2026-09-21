# Host Sticker Foundry on a server

This setup uses the published GHCR images, keeps PostgreSQL, Redis, and the API private, and exposes only the web container.

## 1. Prepare the server

Install Docker Engine and Docker Compose v2. Make sure the server has persistent disk space for PostgreSQL and uploaded sticker files.

Download the release package from the [v1.3.0 release](https://github.com/saitatter/sticker-foundry/releases/tag/v1.3.0), or clone this repository and use the files from `main`.

Copy the environment template:

```bash
cp .env.production.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.production.example .env
```

Edit `.env` before starting. At minimum, replace:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `REGISTRATION_INVITE_CODE`
- `PUBLIC_BASE_URL`, `PASSWORD_RESET_PUBLIC_URL`, and `CORS_ORIGIN`

Use the real public HTTPS address in the URL variables. Set `AUTH_REFRESH_COOKIE_SECURE=false` only when testing over plain HTTP on a private LAN.

## 2. Pull and start the stack

If GHCR asks for authentication, log in with a GitHub token that has `read:packages`:

```bash
docker login ghcr.io
```

Validate the file and start the services:

```bash
docker compose --env-file .env -f docker-compose.production.yml config --quiet
docker compose --env-file .env -f docker-compose.production.yml pull
docker compose --env-file .env -f docker-compose.production.yml up -d
docker compose --env-file .env -f docker-compose.production.yml ps
```

The web UI is available on the server at port `8080` by default. Put it behind an HTTPS reverse proxy for internet access, then forward the public hostname to `http://127.0.0.1:8080`.

For a private LAN test, open `http://SERVER_IP:8080`.

## 3. Optional demo seed

Run this only on a new test installation:

```bash
docker compose --env-file .env -f docker-compose.production.yml exec backend npm run prisma:seed
```

Demo login:

```text
demo@stickerfoundry.local
stickerfoundry123
```

The seed account is an administrator. Change its password and remove demo data before sharing the server.

## 4. Updates

Back up the database and `foundry-data` first. Change `STICKER_FOUNDRY_IMAGE_TAG` in `.env`, then:

```bash
docker compose --env-file .env -f docker-compose.production.yml pull
docker compose --env-file .env -f docker-compose.production.yml up -d
docker compose --env-file .env -f docker-compose.production.yml ps
```

The backend applies Prisma migrations during startup. Keep the previous image tag in `.env` as a rollback option.

## 5. Useful commands

```bash
# Logs
docker compose --env-file .env -f docker-compose.production.yml logs -f backend worker web

# Health checks
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/health/ready

# Stop services without deleting data
docker compose --env-file .env -f docker-compose.production.yml stop

# Remove containers but keep named volumes
docker compose --env-file .env -f docker-compose.production.yml down
```

Never use `docker compose down -v` unless you intentionally want to delete the database, Redis data, and uploaded files.

## 6. Router and HTTPS

Forward only TCP port `80`/`443` to your reverse proxy. Do not forward PostgreSQL `5432`, Redis `6379`, or backend port `3000`; they are intentionally not published by this Compose file.

For a simple reverse proxy, use Caddy or Nginx on the server and point the hostname to the web container at `127.0.0.1:8080`. HTTPS is important because the production configuration uses secure refresh cookies.
