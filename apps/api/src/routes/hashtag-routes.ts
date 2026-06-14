import { Router } from "express";
import { hashtagQueue } from "@saas/queue";
import {
  AUDIT_ACTIONS,
  GenerateHashtagSchema,
  ROLES,
  toPublicJob,
  type AuthRequest
} from "@saas/shared";

import { authMiddleware } from "../auth/auth-middleware";
import { allowRoles } from "../auth/role-middleware";
import { JobService } from "../services/job-service";
import { asyncHandler } from "../lib/async-handler";
import { respond } from "../lib/respond";
import { emitAudit } from "../lib/audit";
import { aiGenerationLimiter } from "../lib/ai-rate-limit";
import { extractIdempotencyKey } from "../lib/idempotency";
import { aiJobsQueuedTotal } from "../lib/metrics";

const router = Router();
const jobService = new JobService();

const GENERATOR_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR];

router.post(
  "/generate",
  authMiddleware,
  aiGenerationLimiter,
  allowRoles(GENERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = GenerateHashtagSchema.parse(req.body);
    const idempotencyKey = extractIdempotencyKey(req);

    if (idempotencyKey) {
      const existing = await jobService.findByIdempotency(
        req.user!.workspaceId,
        idempotencyKey
      );
      if (existing) {
        return respond(
          res,
          toPublicJob(existing),
          200,
          "Returning existing job for idempotency key"
        );
      }
    }

    const dbJob = await jobService.createJob({
      workspaceId: req.user!.workspaceId,
      type: "hashtags",
      payload: data,
      idempotencyKey
    });

    const queueJob = await hashtagQueue.add("generate-hashtags", {
      dbJobId: dbJob._id.toString(),
      workspaceId: req.user!.workspaceId,
      topic: data.topic
    });

    const updatedJob = await jobService.updateJob(dbJob._id, {
      queueJobId: queueJob.id
    });

    emitAudit({
      req,
      action: AUDIT_ACTIONS.AI_HASHTAG_JOB_QUEUED,
      entity: "job",
      entityId: dbJob._id.toString(),
      metadata: { topic: data.topic }
    });

    aiJobsQueuedTotal.inc({ type: "hashtags" });

    respond(res, toPublicJob(updatedJob), 202);
  })
);

export default router;
