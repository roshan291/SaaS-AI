import { Router } from "express";

import {
  ROLES,
  toPublicJob,
  toPublicJobs,
  type AuthRequest
} from "@saas/shared";

import { JobService } from "../src/services/job-service";
import { authMiddleware } from "../src/auth/auth-middleware";
import { allowRoles } from "../src/auth/role-middleware";
import { asyncHandler } from "../src/lib/async-handler";
import { respond, Errors } from "../src/lib/respond";
import { JOB_TYPE_QUEUE_MAP, isJobType } from "../src/lib/queue-map";

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

    // Route the retry to the queue matching the *original* job type. Before
    // this fix every retry was incorrectly sent to the content queue, so a
    // failed hashtag/image job would be retried by the wrong agent.
    const jobType = (job as { type: unknown }).type;
    if (!isJobType(jobType)) {
      throw Errors.validation(
        `Cannot retry job with unknown type "${String(jobType)}"`,
        { type: jobType }
      );
    }

    const { queue, jobName } = JOB_TYPE_QUEUE_MAP[jobType];

    const queueJob = await queue.add(jobName, {
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
