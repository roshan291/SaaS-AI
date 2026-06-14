// Idempotency-Key support for AI generation endpoints.
//
// Contract: a client may include a header `Idempotency-Key: <opaque-string>`
// on POST /generate calls. If a job with the same (workspaceId, key) pair
// already exists, we return that job verbatim instead of creating a new one.
// This lets clients retry safely on network blips without producing duplicate
// AI jobs (and duplicate spend).
//
// Notes:
//   - Keys are scoped to a workspace, not global.
//   - Keys are bounded in length to avoid abusive payloads.
//   - The DB enforces uniqueness via a sparse compound index on
//     `{workspaceId, idempotencyKey}`; this helper is the application-level
//     fast path, the index is the correctness guarantee.
import type { Request } from "express";

const MAX_KEY_LENGTH = 200;
const VALID_KEY = /^[A-Za-z0-9._:-]+$/;

export function extractIdempotencyKey(req: Request): string | undefined {
  const raw = req.header("Idempotency-Key");
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_KEY_LENGTH) return undefined;
  if (!VALID_KEY.test(trimmed)) return undefined;
  return trimmed;
}
