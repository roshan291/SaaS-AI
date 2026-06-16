// apps/api/src/routes/integrations.routes.ts
//
// REST surface for connecting social platforms and inspecting connections.
//
//   GET    /api/v1/integrations/providers          \u2014 list installable platforms
//   GET    /api/v1/integrations                    \u2014 list connected accounts
//   GET    /api/v1/integrations/:platform/oauth-url \u2014 build authorize URL
//   GET    /api/v1/integrations/:platform/callback  \u2014 OAuth redirect target (PUBLIC)
//   DELETE /api/v1/integrations/:platform           \u2014 disconnect
//
// Note: /callback is intentionally unauthenticated. The provider redirects
// the user's browser there, so there's no Bearer token in the request. The
// signed `state` JWT carries the workspaceId; the service verifies it.

import { Router } from "express";
import {
  AUDIT_ACTIONS,
  ROLES,
  type AuthRequest
} from "@saas/shared";

import { PROVIDER_SLUGS, type PlatformSlug } from "@saas/integrations";

import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { asyncHandler } from "../lib/async-handler";
import { respond, Errors } from "../lib/respond";
import { emitAudit } from "../lib/audit";
import { integrationsService } from "../services/integrations-service";

const router = Router();

const ADMIN_ROLES = [ROLES.OWNER, ROLES.ADMIN];

function parsePlatform(value: unknown): PlatformSlug {
  if (typeof value !== "string" || !PROVIDER_SLUGS.includes(value as PlatformSlug)) {
    throw Errors.validation(
      `Unsupported platform. Allowed: ${PROVIDER_SLUGS.join(", ")}`
    );
  }
  return value as PlatformSlug;
}

router.get(
  "/providers",
  authMiddleware,
  asyncHandler(async (_req: AuthRequest, res) => {
    respond(res, integrationsService.listAvailable());
  })
);

router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const accounts = await integrationsService.listConnected(
      req.user!.workspaceId
    );
    respond(res, accounts);
  })
);

router.get(
  "/:platform/oauth-url",
  authMiddleware,
  allowRoles(ADMIN_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const platform = parsePlatform(req.params.platform);
    const result = integrationsService.startOAuth({
      workspaceId: req.user!.workspaceId,
      userId: req.user!.userId,
      platform
    });

    emitAudit({
      req,
      action: AUDIT_ACTIONS.INTEGRATION_OAUTH_INITIATED,
      entity: "integration",
      entityId: platform,
      metadata: { platform }
    });

    respond(res, result);
  })
);

// PUBLIC \u2014 OAuth providers redirect the user's browser here. Don't put
// authMiddleware on this route.
router.get(
  "/:platform/callback",
  asyncHandler(async (req, res) => {
    const platform = parsePlatform(req.params.platform);
    const { code, state, error, error_description } = req.query;

    const feBase =
      process.env.APP_PUBLIC_WEB_URL ?? "http://localhost:3000";
    const successUrl = `${feBase}/settings/integrations?connected=${platform}`;
    const failureUrl = (msg: string) =>
      `${feBase}/settings/integrations?error=${encodeURIComponent(msg)}&platform=${platform}`;

    if (error) {
      return res.redirect(
        failureUrl(String(error_description ?? error))
      );
    }
    if (typeof code !== "string" || typeof state !== "string") {
      return res.redirect(failureUrl("Missing code or state from provider"));
    }

    try {
      const result = await integrationsService.handleCallback({
        platform,
        code,
        state
      });
      // Best-effort audit \u2014 the callback has no req.user, so we synthesise.
      emitAudit({
        req: {
          ...req,
          user: { workspaceId: result.workspaceId, userId: "oauth-callback", role: "system" }
        } as unknown as AuthRequest,
        action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
        entity: "integration",
        entityId: platform,
        metadata: {
          platform,
          externalUsername: result.externalUsername ?? null
        }
      });
      return res.redirect(successUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return res.redirect(failureUrl(msg));
    }
  })
);

router.delete(
  "/:platform",
  authMiddleware,
  allowRoles(ADMIN_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const platform = parsePlatform(req.params.platform);
    const result = await integrationsService.disconnect(
      req.user!.workspaceId,
      platform
    );

    emitAudit({
      req,
      action: AUDIT_ACTIONS.INTEGRATION_DISCONNECTED,
      entity: "integration",
      entityId: platform,
      metadata: { platform }
    });

    respond(res, result);
  })
);

export default router;
