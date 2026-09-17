# syntax=docker/dockerfile:1

# ---------- Сборка ----------
# node:24-alpine вместо node:20: хранилище работает на встроенном node:sqlite,
# поэтому в образе нет ни нативных модулей, ни build-toolchain. Обоснование —
# в docs/DECISIONS.md.
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# Сначала манифесты: слой с зависимостями переиспользуется между сборками.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/data/package.json packages/data/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm -F @cursus/web build && pnpm -F @cursus/api build

# ---------- Прод-образ ----------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/cursus.db \
    WEB_DIST=/app/public

WORKDIR /app

# Только собранный бандл и статика: node_modules не нужны — API собран
# в один файл, снимок данных вкомпилирован внутрь.
# Владелец задаётся сразу в COPY: отдельный chown -R продублировал бы
# все 8 МБ приложения в лишний слой.
COPY --from=build --chown=node:node /app/apps/api/dist/index.js ./index.js
COPY --from=build --chown=node:node /app/apps/web/dist ./public

# Непривилегированный пользователь и volume под базу SQLite.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
