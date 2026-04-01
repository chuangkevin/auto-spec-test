# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
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
ARG NEXT_PUBLIC_API_URL=http://srvhpgit1:32301
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build server (TypeScript → dist + migrations)
RUN pnpm --filter server build

# Build web (Next.js standalone)
RUN pnpm --filter web build

# ── Stage 2: Production ────────────────────────────────────
FROM node:22-slim

WORKDIR /app

# Install Playwright Chromium + system dependencies
RUN npx playwright install --with-deps chromium && rm -rf /tmp/*

# ── Copy Next.js standalone output ──
# standalone includes its own pruned node_modules
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static packages/web/.next/static
COPY --from=builder /app/packages/web/public packages/web/public

# ── Copy Fastify server ──
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules
COPY --from=builder /app/packages/server/package.json packages/server/

# ── Entrypoint ──
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3000 3001

CMD ["./docker-entrypoint.sh"]
