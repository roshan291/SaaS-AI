import { Router } from "express";

import {
  ROLES,
  toPublicJob,
  toPublicJobs,
  type AuthRequest
} from "@saas/shared";

import { aiQueue } from "@saas/queue";

import { JobService } from "../src/services/job-service";
import { authMiddleware } from "../src/auth/auth-middleware";
import { allowRoles } from "../src/auth/role-middleware";
import { asyncHandler } from "../src/lib/async-handler";
import { respond, Errors } from "../src/lib/respond";

const router = Router();
const jobService = new JobService();

// IMPORTANT: Express matches routes top-to-bottom. `/stats` MUST be declared
// before `/:id` so it is not swallowed by the dynamic id matcher.
router.get(
  "/stats",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const stats = await jobService.getStats(req.user!.workspaceId);
    respond(res, stats);
  })
);

router.get(
  "/",
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res) => {
    const jobs = await jobService.getJobs(req.user!.workspaceId);
    respond(res, toPublicJobs(jobs));
  })
);

router.get(
  "/:id",
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

router.post(
  "/:id/retry",
  authMiddleware,
  allowRoles([ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR]),
  asyncHandler(async (req: AuthRequest, res) => {
    const jobId = String(req.params.id);

    const job = await jobService.retryJob(jobId, req.user!.workspaceId);

    // `retryJob` already reset the DB row to status="queued"; now re-enqueue
    // a new BullMQ job so the worker actually picks it up.
    const queueJob = await aiQueue.add("generate-post", {
      dbJobId: job._id.toString(),
      workspaceId: job.workspaceId,
      topic: (job.payload as { topic?: string })?.topic
    });

    const updated = await jobService.updateJob(job._id, {
      queueJobId: queueJob.id
    });

    respond(res, toPublicJob(updated));
  })
);

export default router;
