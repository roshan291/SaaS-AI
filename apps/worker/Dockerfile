# =============================================================================
# Multi-stage Dockerfile for the BullMQ worker.
# Built from the monorepo root:  docker build -f apps/worker/Dockerfile -t saas-worker .
# Runtime uses tsx so we ship .ts directly instead of a separate emit step.
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages ./packages
RUN npm ci --omit=optional

FROM node:20-alpine AS source
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npx tsc --noEmit -p apps/worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=source --chown=app:app /repo /app
USER app
WORKDIR /app/apps/worker

CMD ["npx", "tsx", "src/worker.ts"]
