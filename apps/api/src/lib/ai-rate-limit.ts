// Per-workspace rate limit for AI generation endpoints.
//
// Why per-workspace instead of per-IP? AI calls cost real money and are
// triggered by an authenticated workspace user, not an anonymous visitor.
// Limiting by IP would either be too loose (whole office building shares one
// NAT) or too tight (mobile carriers rotate IPs). Limiting by workspaceId
// matches the unit of billing and is what we actually want to protect.
//
// Tunables (env):
//   AI_RATE_LIMIT_WINDOW_MS  default 1h
//   AI_RATE_LIMIT_MAX        default 30 requests / window / workspace
import rateLimit from "express-rate-limit";
import type { AuthRequest } from "@saas/shared";

const WINDOW_MS = Number(
  process.env.AI_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000
);
const MAX = Number(process.env.AI_RATE_LIMIT_MAX ?? 30);

export const aiGenerationLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Use workspaceId when present; fall back to IP for unauthenticated paths
  // (auth normally runs first, but the keyGenerator must always return a
  // non-undefined string).
  keyGenerator: (req) => {
    const ws = (req as AuthRequest).user?.workspaceId;
    return ws || req.ip || "unknown";
  },
  message: {
    success: false,
    code: "AI_RATE_LIMITED",
    message:
      "Too many AI generation requests for this workspace. Try again later."
  }
});
