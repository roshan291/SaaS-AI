import { Router } from "express";
import { AuthRequest, GenerateContentSchema, ProtectedRequest } from "@saas/shared";
import { JobService } from "../src/services/job-service";
import {
  authMiddleware
} from "../src/auth/auth-middleware";
import { aiQueue } from "@saas/queue";

const router = Router();
const jobService = new JobService();

router.get(
  "/",
  authMiddleware,
  async (
    req: AuthRequest,
    res
  ) => {

    const jobs =
      await jobService.getJobs(
        req.user!.workspaceId
      );

    res.json(jobs);
  }
);

router.get(
  "/stats",
  authMiddleware,
  async (
    req: AuthRequest,
    res
  ) => {

    const stats =
      await jobService.getStats(
        req.user!.workspaceId
      );

    res.json(stats);
  }
);

router.post(
  "/:id/retry",
  authMiddleware,

  async (
    req: AuthRequest,
    res
  ) => {

    try {

      const jobId =
        String(req.params.id);

      const job =
        await jobService.retryJob(
          jobId,
          req.user!.workspaceId
        );

      const queueJob =
        await aiQueue.add(
          "generate-post",
          {
            dbJobId:
              job._id.toString(),

            workspaceId:
              job.workspaceId,

            topic:
              job.payload.topic
          }
        );

      await jobService.updateJob(
        job._id,
        {
          queueJobId:
            queueJob.id
        }
      );

      res.json({
        success: true,
        jobId: job._id,
        queueJobId: queueJob.id
      });

    } catch (error: any) {

      res.status(400).json({
        success: false,
        message:
          error.message
      });
    }
  }
);

export default router;