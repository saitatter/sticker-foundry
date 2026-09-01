FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend apps/backend
COPY apps/worker apps/worker
COPY packages/shared-types packages/shared-types

RUN apk add --no-cache openssl \
  && npm install \
  && npm --workspace apps/backend run prisma:generate \
  && npm --workspace apps/backend run build \
  && npm prune --omit=dev

WORKDIR /app/apps/backend

CMD ["node", "dist/worker.js"]