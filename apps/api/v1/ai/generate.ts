// POST /api/v1/ai/generate
// -----------------------------------------------------------------------------
// One-shot "generate full post" orchestrator. From a single topic this fans
// out three independent BullMQ jobs:
//
//   1. content  -> ContentAgent.generatePost(topic)
//   2. hashtags -> HashtagAgent.generateHashtags(topic)
//   3. image    -> ImageAgent.generateImagePrompt(topic)   (Cloudinary URL)
//
// The response is 202 Accepted with all three queued job rows, e.g.:
//   {
//     success: true,
//     data: {
//       topic: "...",
//       jobs: {
//         content:  { id, status, type, ... },
//         hashtags: { id, status, type, ... },
//         image:    { id, status, type, ... }
//       }
//     }
//   }
//
// Clients poll `GET /api/v1/ai/job/:id` for each job until status === "completed"
// and read `result` to get the post body / hashtag list / image URL respectively.
//
// Idempotency
// -----------
// A single client-supplied `Idempotency-Key` header is namespaced per job
// type when persisted (`<key>:content`, `<key>:hashtags`, `<key>:image`)
// so the three rows don't collide on the unique (workspaceId, idempotencyKey)
// index and replays return the original triplet instead of enqueuing again.

import { Router } from "express";
import { aiQueue, hashtagQueue, imageQueue } from "@saas/queue";
import {
  AUDIT_ACTIONS,
  GenerateContentSchema,
  ROLES,
  toPublicJob,
  type AuthRequest,
  type AuditAction
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

// Static definition of every queue we fan out to. Adding a new agent
// (e.g. video) is a one-line append here.
type FanoutKey = "content" | "hashtags" | "image";

interface FanoutEntry {
  key: FanoutKey;
  dbType: FanoutKey;
  queue: typeof aiQueue;
  queueJobName: string;
  auditAction: AuditAction;
  metricLabel: "content" | "hashtags" | "image";
}

const FANOUT: ReadonlyArray<FanoutEntry> = [
  {
    key: "content",
    dbType: "content",
    queue: aiQueue,
    queueJobName: "generate-post",
    auditAction: AUDIT_ACTIONS.AI_CONTENT_JOB_QUEUED,
    metricLabel: "content"
  },
  {
    key: "hashtags",
    dbType: "hashtags",
    queue: hashtagQueue,
    queueJobName: "generate-hashtags",
    auditAction: AUDIT_ACTIONS.AI_HASHTAG_JOB_QUEUED,
    metricLabel: "hashtags"
  },
  {
    key: "image",
    dbType: "image",
    queue: imageQueue,
    queueJobName: "generate-image",
    auditAction: AUDIT_ACTIONS.AI_IMAGE_JOB_QUEUED,
    metricLabel: "image"
  }
];

router.post(
  "/generate",
  authMiddleware,
  // Rate limit runs AFTER auth so we can key by workspaceId, not IP.
  aiGenerationLimiter,
  allowRoles(GENERATOR_ROLES),
  asyncHandler(async (req: AuthRequest, res) => {
    const data = GenerateContentSchema.parse(req.body);
    const workspaceId = req.user!.workspaceId;
    const idempotencyKey = extractIdempotencyKey(req);

    // ---- Idempotency replay --------------------------------------------
    // If the caller is replaying a previous fan-out, return the original
    // triplet instead of enqueuing again. Only treat as a *full* replay when
    // all three namespaced keys resolve — partial replays fall through and
    // any missing job gets enqueued below.
    if (idempotencyKey) {
      const existing = await Promise.all(
        FANOUT.map((f) =>
          jobService.findByIdempotency(
            workspaceId,
            namespacedKey(idempotencyKey, f.key)
          )
        )
      );

      if (existing.every((j) => j !== null)) {
        const jobs = Object.fromEntries(
          FANOUT.map((f, i) => [f.key, toPublicJob(existing[i]!)])
        );
        return respond(
          res,
          { topic: data.topic, jobs },
          200,
          "Returning existing jobs for idempotency key"
        );
      }
    }

    // ---- Fan out: create DB rows + enqueue BullMQ jobs in parallel -----
    const results = await Promise.all(
      FANOUT.map(async (f) => {
        const key = idempotencyKey
          ? namespacedKey(idempotencyKey, f.key)
          : undefined;

        // If this slot was already persisted in a prior partial fan-out
        // (e.g. content succeeded, image crashed) reuse it. Avoids
        // duplicate BullMQ pushes on retries.
        const prior = key
          ? await jobService.findByIdempotency(workspaceId, key)
          : null;

        if (prior) {
          return { entry: f, dbJob: prior };
        }

        const dbJob = await jobService.createJob({
          workspaceId,
          type: f.dbType,
          payload: data,
          idempotencyKey: key
        });

        const queueJob = await f.queue.add(f.queueJobName, {
          dbJobId: dbJob._id.toString(),
          workspaceId,
          topic: data.topic
        });

        const updated = await jobService.updateJob(dbJob._id, {
          queueJobId: queueJob.id
        });

        emitAudit({
          req,
          action: f.auditAction,
          entity: "job",
          entityId: dbJob._id.toString(),
          metadata: { topic: data.topic }
        });

        aiJobsQueuedTotal.inc({ type: f.metricLabel });

        return { entry: f, dbJob: updated };
      })
    );

    const jobs = Object.fromEntries(
      results.map((r) => [r.entry.key, toPublicJob(r.dbJob)])
    );

    respond(res, { topic: data.topic, jobs }, 202);
  })
);

// ---- Single-job status lookup -------------------------------------------
// Clients poll any of the three returned job ids until status === "completed"
// and pull the agent output from `result`.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function namespacedKey(key: string, type: FanoutKey): string {
  return `${key}:${type}`;
}
