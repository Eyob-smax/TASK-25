# GreenCycle API — Multi-stage Dockerfile
# Runtime: Node.js 20 LTS (Alpine)
# Datastore: SQLite (file-based, mounted volume at /app/database)
# Backups:   Encrypted snapshots at /app/backups (mounted volume)

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# Prefer deterministic installs when a lockfile is committed; fall back to npm install
# (produces a lockfile in the image) when none is present so the build still succeeds.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -S greencycle && adduser -S greencycle -G greencycle

COPY --from=build /app/dist ./dist/
COPY --from=build /app/node_modules ./node_modules/
COPY --from=build /app/prisma ./prisma/
COPY --from=build /app/package.json ./

RUN mkdir -p /app/database /app/backups && \
    chown -R greencycle:greencycle /app/database /app/backups

USER greencycle

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/app/database/greencycle.db
ENV BACKUP_DIR=/app/backups
ENV LOG_LEVEL=info
# SESSION_TIMEOUT_HOURS, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MINUTES use code defaults (8, 5, 15)
# ENCRYPTION_MASTER_KEY must be provided at runtime — no default (empty key is dev-only)

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
