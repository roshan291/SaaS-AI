import { Router } from "express";
import {
  AUDIT_ACTIONS,
  CreateWorkspaceSchema,
  ROLES,
  type AuthRequest
} from "@saas/shared";

import { WorkspaceService } from "../services/workspace-service";
import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";
import { emitAudit } from "../lib/audit";

const router = Router();
const service = new WorkspaceService();

// Creating a workspace is gated behind auth. The new workspace inherits the
// authenticated caller as `ownerId` so a user cannot spoof another owner.
//
// NOTE: the registration / first-workspace bootstrap flow lives at
// POST /api/v1/auth/register — that endpoint is the only unauthenticated
// way to create a workspace.
router.post(
  "/",
  authMiddleware,
  allowRoles([ROLES.OWNER]),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = CreateWorkspaceSchema.parse(req.body);

    const workspace = await service.createWorkspace({
      name: data.name,
      slug: data.slug,
      ownerId: req.user!.userId,
      settings: data.settings
    });

    emitAudit({
      req,
      action: AUDIT_ACTIONS.WORKSPACE_CREATED,
      entity: "workspace",
      entityId: workspace._id.toString(),
      metadata: { slug: workspace.slug }
    });

    respond(res, workspace, 201);
  })
);

// Only return workspaces the caller actually owns. Listing every workspace
// in the database (the previous behavior) was a cross-tenant data leak.
router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const mine = await service.getMine(req.user!.userId);
    respond(res, mine);
  })
);

export default router;
