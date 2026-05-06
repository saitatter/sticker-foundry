FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/backend apps/backend
COPY packages/shared-types packages/shared-types

RUN npm install \
  && npm --workspace apps/backend run prisma:generate \
  && npm --workspace apps/backend run build \
  && npm prune --omit=dev

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
