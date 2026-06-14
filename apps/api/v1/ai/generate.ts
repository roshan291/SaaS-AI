import { Router } from "express";
import { aiQueue } from "@saas/queue";
import {
  AUDIT_ACTIONS,
  GenerateContentSchema,
  ROLES,
  toPublicJob,
  type AuthRequest
} from "@saas/shared";

import { JobService } from "../../src/services/job-service";
import { authMiddleware } from "../../src/auth/auth-middleware";
import { allowRoles } from "../../src/auth/role-middleware";
import { asyncHandler } from "../../src/lib/async-handler";
import { respond, Errors } from "../../src/lib/respond";
import { emitAudit } from "../../src/lib/audit";
import { aiGenerationLimiter } from "../../src/lib/ai-rate-limit";
import { extractIdempotencyKey } from "../../src/lib/idempotency";
import { aiJobsQueuedTotal } from "../../src/lib/metrics";

const router = Router();
const jobService = new JobService();

const GENERATOR_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR];

router.post(
  "/generate",
  authMiddleware,
  // Rate limit runs AFTER auth so we can key by workspaceId, not IP.
  aiGenerationLimiter,
  allowRoles(GENERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = GenerateContentSchema.parse(req.body);
    const idempotencyKey = extractIdempotencyKey(req);

    // If the caller is replaying a previous request, return the original job
    // instead of enqueuing again. We treat this as 200 (not 202) because no
    // new work was created.
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
      type: "content",
      payload: data,
      idempotencyKey
    });

    const queueJob = await aiQueue.add("generate-post", {
      dbJobId: dbJob._id.toString(),
      workspaceId: req.user!.workspaceId,
      topic: data.topic
    });

    const updatedJob = await jobService.updateJob(dbJob._id, {
      queueJobId: queueJob.id
    });

    emitAudit({
      req,
      action: AUDIT_ACTIONS.AI_CONTENT_JOB_QUEUED,
      entity: "job",
      entityId: dbJob._id.toString(),
      metadata: { topic: data.topic }
    });

    aiJobsQueuedTotal.inc({ type: "content" });

    respond(res, toPublicJob(updatedJob), 202);
  })
);

router.get(
  "/job/:id",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const job = await jobService.getJobById(
      String(req.params.id),
      req.user!.workspaceId
    );

    if (!job) {
      throw Errors.notFound("Job");
    }

    respond(res, toPublicJob(job));
  })
);

router.get("/test", (_req, res) => {
  respond(res, { message: "AI Route Working" });
});

export default router;
