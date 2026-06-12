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

const router = Router();
const jobService = new JobService();

const GENERATOR_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR];

router.post(
  "/generate",
  authMiddleware,
  allowRoles(GENERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = GenerateContentSchema.parse(req.body);

    const dbJob = await jobService.createJob({
      workspaceId: req.user!.workspaceId,
      type: "content",
      payload: data
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
