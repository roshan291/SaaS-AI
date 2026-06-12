# social-media-saas

A multi-tenant SaaS that uses LLMs to generate social-media content, hashtags,
images, and video scripts. The codebase is a Turborepo monorepo:

- `apps/api` – Express 5 + TypeScript REST API
- `apps/worker` – BullMQ worker that consumes 4 queues (content/hashtag/image/video)
- `apps/web` – Next.js front-end (not part of this hardening pass)
- `packages/db` – Mongoose models + repositories
- `packages/queue` – BullMQ queue definitions + shared retry policy
- `packages/shared` – Zod schemas, DTOs, audit-action constants
- `packages/agents` – Provider-backed AI agents (OpenAI / Gemini)

## Quick start (local)

```bash
# 1. Install
npm install

# 2. Copy env templates
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
# Fill in MONGODB_URI, REDIS_URL, JWT_SECRET (>=32 chars), OPENAI_API_KEY, GEMINI_API_KEY

# 3. Run everything
npm run dev
```

The API listens on `http://localhost:4000`. Visit `/api/v1/healthz` and
`/api/v1/readyz` to verify it can talk to Mongo + Redis.

## Production essentials

| Concern             | Implementation                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Auth                | JWT (HS256, ≥32-char secret, iss + aud claims, 1h default expiry)        |
| Password hashing    | bcrypt cost 12 + constant-time comparison even for missing users         |
| RBAC                | `owner` / `admin` / `editor` / `viewer` — enforced per route             |
| Multi-tenant        | `workspaceId` is server-derived from JWT; never trusted from request    |
| Rate limiting       | Global 300 req/min + 20 req/15min on `/api/v1/auth/*`                    |
| Headers             | `helmet()` with sensible defaults                                       |
| CORS                | Allow-list via `ALLOWED_ORIGINS` (CSV)                                   |
| Body size           | `100kb` JSON limit (configurable via `JSON_BODY_LIMIT`)                  |
| Request correlation | `x-request-id` echoed back; included in every log line                  |
| Logging             | `pino` with secret redaction (auth headers, password, API keys, URIs)   |
| Error handling      | Central handler maps Zod / Mongoose / AppError to uniform envelope       |
| Queue durability    | 5 attempts, exponential backoff, removeOnComplete/Fail policies          |
| Stalled jobs        | Watchdog sweeps `processing` jobs > 10m every 60s                       |
| Audit log           | `AuditLogRepository.listForWorkspace` + `emitAudit()` on every mutation  |
| Health probes       | `/api/v1/healthz` (liveness) + `/api/v1/readyz` (Mongo + Redis check)    |
| Graceful shutdown   | API drains HTTP then Mongo; worker closes BullMQ then Mongo             |

## Scripts

```bash
npm run dev        # turbo run dev (api + worker + web)
npm run build      # turbo run build
npm run typecheck  # tsc --noEmit across every workspace
npm run lint       # turbo run lint (when configured)
```

## ⚠️ CRITICAL: secret rotation

The git history of this repo contains real production credentials that were
checked in before `.gitignore` was added:

| Secret               | Location                  | Action                                    |
| -------------------- | ------------------------- | ----------------------------------------- |
| MongoDB Atlas user   | `apps/api/.env` (history) | Reset password in Atlas; update env       |
| Upstash Redis URL    | `apps/api/.env` (history) | Rotate token in Upstash; update env       |
| `JWT_SECRET`         | `apps/api/.env` (history) | Generate a new ≥32-char random secret      |
| Gemini API key       | `apps/worker/.env` (hist) | Revoke in Google AI Studio; reissue       |
| OpenAI API key (if)  | `apps/worker/.env` (hist) | Revoke in OpenAI dashboard; reissue       |

After rotating, scrub the history (this rewrites history — coordinate with
collaborators first):

```bash
# Requires git-filter-repo (https://github.com/newren/git-filter-repo)
git filter-repo --path apps/api/.env --invert-paths
git filter-repo --path apps/worker/.env --invert-paths
git push origin --force --all
git push origin --force --tags
```

Then re-share the repo with collaborators and have them re-clone.

## API surface

```
POST   /api/v1/auth/register          # bootstraps a workspace + owner user
POST   /api/v1/auth/login
GET    /api/v1/auth/me

POST   /api/v1/workspaces             # owner-only
GET    /api/v1/workspaces             # returns ONLY workspaces you own

POST   /api/v1/users                  # owner/admin invites teammate
GET    /api/v1/users
GET    /api/v1/users/:id

POST   /api/v1/posts                  # editor+
GET    /api/v1/posts?status=draft|scheduled|published
GET    /api/v1/posts/:id
PATCH  /api/v1/posts/:id
DELETE /api/v1/posts/:id              # owner/admin
POST   /api/v1/posts/:id/publish

POST   /api/v1/ai/generate            # 202 Accepted, returns queued job
POST   /api/v1/hashtags/generate
POST   /api/v1/images/generate
POST   /api/v1/videos/generate

GET    /api/v1/jobs
GET    /api/v1/jobs/stats             # { queued, processing, completed, failed, total }
GET    /api/v1/jobs/:id
POST   /api/v1/jobs/:id/retry

GET    /api/v1/audit-logs             # owner/admin, supports limit + before cursor

GET    /api/v1/healthz                # liveness (no deps)
GET    /api/v1/readyz                 # readiness (Mongo + Redis)
```

Every successful response is wrapped in:

```json
{ "success": true, "data": <payload>, "requestId": "..." }
```

Every error response is:

```json
{ "success": false, "code": "VALIDATION_ERROR", "message": "...", "details": {...}, "requestId": "..." }
```

## What still isn't built

These pieces were not in the original audit scope but are required for a
full "enterprise launch":

- **Tests** — unit + integration. Add Vitest + Supertest; aim for ≥80% coverage on new code.
- **OpenAPI spec** — generate from Zod schemas (e.g. `zod-to-openapi`) and publish under `/api/v1/openapi.json`.
- **Refresh tokens / token revocation** — currently JWTs are stateless and only short-lived; for true session control add a refresh-token table or use a session store.
- **MFA + SSO (SAML / OIDC)** — required for most enterprise buyers.
- **Billing** — Stripe integration with per-workspace usage metering.
- **Social-platform integrations** — Twitter/X, LinkedIn, Instagram posting + scheduling.
- **Object storage** — S3 (or compatible) for generated media; presigned URLs.
- **Observability** — OpenTelemetry traces + metrics (Prometheus); ship logs to your aggregator (Datadog / ELK / etc.).
- **WAF + DDoS protection** — Cloudflare / AWS WAF in front of the API.
- **Secrets management** — move env vars out of `.env` files into AWS Secrets Manager / Vault / Doppler.
- **Backups + disaster recovery runbook** — Mongo PITR, Redis persistence, restore drills.
