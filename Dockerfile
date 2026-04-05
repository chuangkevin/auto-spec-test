# ── Stage 1: Build ──────────────────────────────────────────
FROM node:24 AS builder
# node:24 (non-slim) 已內建 python3, make, g++，不需要 apt-get
# Must match Node version in playwright image (v1.58.2 uses Node 24)

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/server packages/server
COPY packages/web packages/web

# Build-time env: frontend API URL baked into Next.js bundle
# 空字串 = 同 origin（透過 Ingress 轉發 /api/* 到後端）
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build server (TypeScript → dist + migrations)
RUN pnpm --filter server build

# Build web (Next.js standalone)
RUN pnpm --filter web build

# ── Stage 2: Production ────────────────────────────────────
# 用 Playwright 官方 image — 已內建 Chromium + 所有系統依賴，不需要 apt-get
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# ── Copy Next.js standalone output ──
# standalone includes its own pruned node_modules
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static packages/web/.next/static
COPY --from=builder /app/packages/web/public packages/web/public

# ── Copy Fastify server ──
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
# pnpm hoists deps to root node_modules — copy both
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules

# ── Install nginx for reverse proxy ──
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*
COPY nginx.conf /etc/nginx/nginx.conf

# ── Entrypoint ──
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# nginx listens on 3000 (public), proxies to Next.js 3002 and Fastify 3001
EXPOSE 3000 3001

CMD ["./docker-entrypoint.sh"]
