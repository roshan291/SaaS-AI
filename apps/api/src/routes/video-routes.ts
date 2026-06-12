import { Router } from "express";
import { videoQueue } from "@saas/queue";
import {
    AUDIT_ACTIONS,
    GenerateVideoSchema,
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

const router = Router();
const jobService = new JobService();

const GENERATOR_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.EDITOR];

router.post(
    "/generate",
    authMiddleware,
    allowRoles(GENERATOR_ROLES),
    asyncHandler(async (req: AuthRequest, res) => {
        const data = GenerateVideoSchema.parse(req.body);

        const dbJob = await jobService.createJob({
            workspaceId: req.user!.workspaceId,
            type: "video",
            payload: data
        });

        const queueJob = await videoQueue.add("generate-video", {
            dbJobId: dbJob._id.toString(),
            workspaceId: req.user!.workspaceId,
            topic: data.topic
        });

        const updatedJob = await jobService.updateJob(dbJob._id, {
            queueJobId: queueJob.id
        });

        emitAudit({
            req,
            action: AUDIT_ACTIONS.AI_VIDEO_JOB_QUEUED,
            entity: "job",
            entityId: dbJob._id.toString(),
            metadata: { topic: data.topic }
        });

        respond(res, toPublicJob(updatedJob), 202);
    })
);

export default router;
