# Server deployment

Use a new PostgreSQL database and storage for this major version. Do not attach a previous installation's database. Initialization refuses unrelated schemas without changing them. Keep existing backups independently.

Copy `.env.production.example` to `.env`. Set strong distinct PostgreSQL/JWT secrets, public HTTPS URLs, explicit CORS origins and registration policy. Configure SMTP for password reset. Named volumes persist PostgreSQL, Redis and media.

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d --build
```

Add `-f docker-compose.ai.yml` for CPU AI removal. The first AI request may download model weights into persistent storage. Threshold removal needs no download.

Ports bind to loopback. Put an HTTPS reverse proxy before the web port; web proxies `/api` to FastAPI. Keep PostgreSQL and Redis private. All workers must share the API image version and storage configuration.

For published images set `STICKER_FOUNDRY_VERSION` to an exact release and add `-f docker-compose.ghcr.yml`. Server archives include source inputs for Docker builds.

Check `/api/health/ready` through the public origin. Back up PostgreSQL and media consistently; preserve `.env` securely. Restore into an isolated instance first and verify exports and permissions. Never run disposable acceptance tests against production.
