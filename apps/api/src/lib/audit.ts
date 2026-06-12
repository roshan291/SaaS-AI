import type { Request } from "express";
import { AuditLogRepository } from "@saas/db";
import type { AuditAction } from "@saas/shared";
import { logger } from "./logger";

interface EmitOptions {
  req: Request;
  action: AuditAction | string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  // For unauthenticated audit events (LOGIN_FAILURE) we accept overrides.
  workspaceId?: string;
  userId?: string;
}

// Fire-and-forget audit emitter. Never blocks the request — failures are
// logged but do not bubble up so a Mongo hiccup cannot break a login.
export function emitAudit(opts: EmitOptions): void {
  const workspaceId = opts.workspaceId ?? opts.req.user?.workspaceId;
  const userId = opts.userId ?? opts.req.user?.userId;

  if (!workspaceId) {
    // Without a workspace context the row is not useful; log and skip.
    logger.debug(
      { action: opts.action },
      "Skipping audit log: no workspace context"
    );
    return;
  }

  const doc = {
    workspaceId,
    userId,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    metadata: opts.metadata,
    ip:
      (opts.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      opts.req.ip,
    userAgent: opts.req.headers["user-agent"] as string | undefined
  };

  // Do not await — audit emission must never delay the user-facing response.
  AuditLogRepository.create(doc).catch((err) => {
    logger.error(
      { err, action: opts.action, requestId: opts.req.id },
      "Failed to write audit log"
    );
  });
}
