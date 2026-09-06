FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web apps/web
COPY packages/shared-types packages/shared-types

RUN npm install --ignore-scripts && npm --workspace apps/web run build

FROM nginx:1.27-alpine

ARG OCI_SOURCE="https://github.com/saitatter/sticker-foundry"
ARG OCI_REVISION=""
ARG OCI_VERSION=""

LABEL org.opencontainers.image.source="${OCI_SOURCE}" \
  org.opencontainers.image.revision="${OCI_REVISION}" \
  org.opencontainers.image.version="${OCI_VERSION}" \
  org.opencontainers.image.title="Sticker Foundry Web"

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
