import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  AUDIT_ACTIONS,
  LoginSchema,
  RegisterOwnerSchema,
  type AuthRequest
} from "@saas/shared";

import { AuthService } from "./auth-service";
import { authMiddleware } from "./auth-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";
import { emitAudit } from "../lib/audit";

const router = Router();
const authService = new AuthService();

// Defense-in-depth: per-IP rate limit on the login + register endpoints. The
// global rate-limiter in server.ts is more permissive; this one is strict.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT ?? 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many auth attempts, please try again later"
  }
});

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = LoginSchema.parse(req.body);

    try {
      const result = await authService.login(data.email, data.password);

      emitAudit({
        req,
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entity: "user",
        entityId: result.user?.id,
        workspaceId: result.user?.workspaceId,
        userId: result.user?.id,
        metadata: { email: data.email }
      });

      respond(res, result);
    } catch (err) {
      emitAudit({
        req,
        action: AUDIT_ACTIONS.LOGIN_FAILURE,
        // We do not yet know the workspace; the audit emitter will skip if
        // there is no workspace context. That is acceptable because the
        // application-level logger still records the attempt.
        metadata: { email: data.email }
      });
      throw err;
    }
  })
);

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = RegisterOwnerSchema.parse(req.body);
    const result = await authService.registerOwner(data);

    emitAudit({
      req,
      workspaceId: result.user?.workspaceId,
      userId: result.user?.id,
      action: AUDIT_ACTIONS.WORKSPACE_CREATED,
      entity: "workspace",
      entityId: result.user?.workspaceId,
      metadata: { via: "register-owner" }
    });

    respond(res, result, 201);
  })
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await authService.me(
      req.user!.userId,
      req.user!.workspaceId
    );
    respond(res, user);
  })
);

export default router;
