import { Router } from "express";

import {
  ROLES,
  type AuthRequest
} from "@saas/shared";

import { AuditLogRepository } from "@saas/db";

import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";

const router = Router();

// Audit logs are sensitive. Restrict reads to OWNER + ADMIN.
//
// Query params:
//   limit   -> max items to return (default 50, max 200)
//   before  -> ISO date cursor; only returns rows created strictly before this
//   action  -> filter by a single AUDIT_ACTIONS code (e.g. LOGIN_FAILURE)
//
// To paginate, take the `createdAt` of the last item in the previous page and
// pass it back as `before` on the next request.
router.get(
  "/",
  authMiddleware,
  allowRoles([ROLES.OWNER, ROLES.ADMIN]),
  asyncHandler(async (req: AuthRequest, res) => {
    const { limit, before, action } = req.query as Record<string, string>;

    const items = await AuditLogRepository.listForWorkspace(
      req.user!.workspaceId,
      {
        limit: limit ? Number(limit) : undefined,
        before: before ? new Date(before) : undefined,
        action: action || undefined
      }
    );

    respond(res, items);
  })
);

export default router;
