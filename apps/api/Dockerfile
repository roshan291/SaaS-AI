# =============================================================================
# Multi-stage Dockerfile for the API service.
# Built from the monorepo root:  docker build -f apps/api/Dockerfile -t saas-api .
# Runtime uses tsx (esbuild-backed TypeScript runner) so we ship .ts directly
# instead of running a separate emit step. tsx is stable for production use.
# =============================================================================

# ---------- Stage 1: deps ----------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /repo

# Copy only the manifests we need to install dependencies. Maximizes layer
# cache hits when source changes but deps do not.
COPY package.json package-lock.json* ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages ./packages

RUN npm ci --omit=optional

# ---------- Stage 2: source ----------------------------------------------------
# Bring in the actual source. Kept separate from `deps` so source changes
# don't bust the dependency layer cache.
FROM node:20-alpine AS source
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .

# Type-check before shipping. Fails the build if there are TS errors.
RUN npx tsc --noEmit -p apps/api

# ---------- Stage 3: runtime -------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run as non-root for defense-in-depth
RUN addgroup -S app && adduser -S app -G app

COPY --from=source --chown=app:app /repo /app

USER app
WORKDIR /app/apps/api

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/v1/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
