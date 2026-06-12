import { Router } from "express";

import {
  authMiddleware
} from "../auth/auth-middleware";

import {
  hashtagQueue
} from "@saas/queue";

import {
  JobService
} from "../services/job-service";

import {
  GenerateHashtagSchema,
  AuthRequest
} from "@saas/shared";

const router = Router();

const jobService =
  new JobService();

router.post(
  "/generate",

  authMiddleware,

  async (
    req: AuthRequest,
    res
  ) => {

    const data =
      GenerateHashtagSchema.parse(
        req.body
      );

    const dbJob =
      await jobService.createJob({
        workspaceId:
          req.user!.workspaceId,

        type:
          "hashtags",

        payload:
          data
      });

    const queueJob =
      await hashtagQueue.add(
        "generate-hashtags",
        {
          dbJobId:
            dbJob._id.toString(),

          topic:
            data.topic
        }
      );

    await jobService.updateJob(
      dbJob._id,
      {
        queueJobId:
          queueJob.id
      }
    );

    res.status(202).json({
      jobId:
        dbJob._id,

      status:
        "queued"
    });
  }
);

export default router;