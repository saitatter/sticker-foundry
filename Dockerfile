FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend apps/backend
COPY apps/web apps/web
COPY packages/shared-types packages/shared-types

RUN npm install \
  && npm --workspace apps/backend run prisma:generate \
  && npm --workspace apps/backend run build \
  && npm --workspace apps/web run build \
  && npm prune --omit=dev

FROM node:20-bookworm-slim

ARG OCI_SOURCE="https://github.com/saitatter/sticker-foundry"
ARG OCI_REVISION=""
ARG OCI_VERSION=""

LABEL org.opencontainers.image.source="${OCI_SOURCE}" \
  org.opencontainers.image.revision="${OCI_REVISION}" \
  org.opencontainers.image.version="${OCI_VERSION}" \
  org.opencontainers.image.title="StickerFoundry" \
  org.opencontainers.image.description="All-in-one StickerFoundry server with web UI, API, PostgreSQL, and AI background removal"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libgomp1 \
    nginx \
    openssl \
    postgresql \
    postgresql-client \
    python3 \
    python3-pip \
    python3-venv \
    wget \
  && python3 -m venv /opt/rembg \
  && /opt/rembg/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/rembg/bin/pip install --no-cache-dir "rembg[cpu]" \
  && rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /var/lib/postgresql/*

ENV BACKGROUND_REMOVAL_COMMAND="rembg i {input} {output}" \
  DATA_DIR="/data/app" \
  EXPORT_CACHE_DIR="/data/app/export-cache" \
  HOME="/data" \
  NODE_ENV="production" \
  PATH="/opt/rembg/bin:${PATH}" \
  PORT="3000" \
  POSTGRES_DATA_DIR="/data/postgres" \
  U2NET_HOME="/data/rembg-models"

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/backend/package.json apps/backend/package.json
COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/apps/backend/prisma apps/backend/prisma
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/all-in-one/nginx.conf /etc/nginx/conf.d/sticker-foundry.conf
COPY docker/all-in-one/start.sh /usr/local/bin/sticker-foundry-start

RUN chmod +x /usr/local/bin/sticker-foundry-start

VOLUME ["/data"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q --spider http://127.0.0.1/api/health || exit 1

CMD ["sticker-foundry-start"]
