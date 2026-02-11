FROM oven/bun:1 AS base

# Build frontend
FROM base AS builder
WORKDIR /app
COPY package.json ./
RUN bun install --no-save
COPY . .
RUN bun run build:web

# Production
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/package.json .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/dist/web ./dist/web

VOLUME /data
ENV DATABASE_PATH=/data/agentfeed.db
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "src/server/index.ts"]
