import { Router } from "express";

import {
    authMiddleware
} from "../auth/auth-middleware";

import {
    videoQueue
} from "@saas/queue";

import {
    JobService
} from "../services/job-service";

import {
    GenerateVideoSchema,
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
            GenerateVideoSchema.parse(
                req.body
            );

        const dbJob =
            await jobService.createJob({
                workspaceId:
                    req.user!.workspaceId,

                type:
                    "video",

                payload:
                    data
            });

        const queueJob =
            await videoQueue.add(
                "generate-video",
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