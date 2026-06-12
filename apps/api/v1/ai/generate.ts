import { Router } from "express";
import { aiQueue } from "@saas/queue";
import { AuthRequest, GenerateContentSchema } from "@saas/shared";
import { JobService } from "../../src/services/job-service";
import {
  authMiddleware
} from "../../src/auth/auth-middleware";

const router = Router();
const jobService = new JobService();


router.post(
  "/generate",
  authMiddleware,
  async (
    req: AuthRequest,
    res
  ) => {


    const data =
      GenerateContentSchema.parse(
        req.body
      );

    const dbJob =
      await jobService.createJob({
        workspaceId:
          req.user!.workspaceId,

        type:
          "content",

        payload:
          data
      });

    const queueJob =
      await aiQueue.add(
        "generate-post",
        {
          dbJobId:
            dbJob._id.toString(),

          workspaceId:
            req.user!.workspaceId,

          topic:
            data.topic
        }
      );

    const updatedJob =
      await jobService.updateJob(
        dbJob._id,
        {
          queueJobId:
            queueJob.id
        }
      );

    res.status(202).json(updatedJob);
  }
);

router.get(
  "/job/:id",
  authMiddleware,
  async (req: AuthRequest, res) => {

    const jobId = String(req.params.id);

    const job =
      await jobService.getJobById(
        jobId,
        req.user!.workspaceId
      );

    if (!job) {
      return res.status(404).json({
        message: "Job not found"
      });
    }
    return res.json(job);
    // const state = await job.getState();

    // return res.json({
    //   id: job.id,
    //   state,
    //   result: state === "completed" ? job.returnvalue : null,
    //   failedReason: state === "failed" ? job.failedReason : undefined,
    //   attemptsMade: job.attemptsMade
    // });
  }
);

router.get(
  "/test",
  (req, res) => {
    res.json({
      message: "AI Route Working"
    });
  }
);

export default router;