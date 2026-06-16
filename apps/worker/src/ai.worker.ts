import { Worker, type Processor, type WorkerOptions } from "bullmq";

import {
  redisConfig,
  AI_CONTENT_QUEUE_NAME,
  HASHTAG_QUEUE_NAME,
  IMAGE_QUEUE_NAME,
  PUBLISH_QUEUE_NAME,
  type PublishJobPayload
} from "@saas/queue";

import {
  ContentAgent,
  HashtagAgent,
  ImageAgent
} from "@saas/agents";

import {
  JobRepository,
  PostRepository,
  SocialAccountRepository,
  PostModel
} from "@saas/db";

import {
  getProvider,
  decryptSecret,
  type PlatformSlug
} from "@saas/integrations";

import { logger } from "./logger";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

// Gemini free-tier limits text generation to 5 requests / minute on
// `gemini-2.5-flash`, which the content/hashtag/image agents all share.
// Without a per-worker rate limiter, BullMQ would re-deliver a failed job
// within ~100ms and immediately get another 429. The `limiter` option below
// caps each queue's *start rate* so failed jobs get a real cooldown before
// the next attempt. Tune via env if you upgrade to a paid Gemini plan.
//
//   ratePerWindow   — max jobs started per `rateWindowMs`
//   rateWindowMs    — sliding window, in ms
const ratePerWindow = Number(process.env.WORKER_RATE_LIMIT_MAX ?? 4);
const rateWindowMs = Number(
  process.env.WORKER_RATE_LIMIT_WINDOW_MS ?? 60_000
);
const limiter = { max: ratePerWindow, duration: rateWindowMs };

// -----------------------------------------------------------------------------
// Lock / stall tuning
// -----------------------------------------------------------------------------
// BullMQ's default lockDuration is 30s. Gemini image generation routinely
// takes 30–60s, and the JavaScript Debug Terminal pauses the event loop on
// `debugger;` breakpoints (which also freezes BullMQ's lock-renewal timer).
// Either situation causes "Missing lock for job N. moveToDelayed" and
// "job stalled more than allowable limit" errors.
//
// 5 minutes covers:
//   * Worst-case Gemini image generation (~60s) + text refine (~15s)
//   * Local debugging sessions where you pause at a breakpoint for a minute
//   * Network blips on the Cloudinary upload
//
// In production set WORKER_LOCK_DURATION_MS lower (e.g. 90_000) so a truly
// crashed worker's jobs become eligible for redelivery faster.
const lockDurationMs = Number(
  process.env.WORKER_LOCK_DURATION_MS ?? 5 * 60_000
);
const stalledIntervalMs = Number(
  process.env.WORKER_STALLED_INTERVAL_MS ?? 30_000
);
const maxStalledCount = Number(
  process.env.WORKER_MAX_STALLED_COUNT ?? 2
);

const baseWorkerOptions: WorkerOptions = {
  connection: redisConfig,
  concurrency,
  limiter,
  lockDuration: lockDurationMs,
  // Auto-renew the lock at half the duration. BullMQ's default is also
  // lockDuration/2 but pinning it explicitly avoids surprises if a future
  // version changes the default ratio.
  lockRenewTime: Math.max(1_000, Math.floor(lockDurationMs / 2)),
  stalledInterval: stalledIntervalMs,
  maxStalledCount
};

const contentAgent = new ContentAgent();
const hashtagAgent = new HashtagAgent();
const imageAgent = new ImageAgent();

// Wrap an agent call with consistent DB-status transitions so every queue
// emits the same lifecycle: queued -> processing -> completed | failed.
function makeProcessor(
  run: (topic: string) => Promise<unknown>
): Processor {
  return async (job) => {
    const { dbJobId, topic } = job.data as {
      dbJobId: string;
      topic: string;
    };

    if (!dbJobId) {
      throw new Error("Job is missing dbJobId");
    }

    const log = logger.child({
      queue: job.queueName,
      bullJobId: job.id,
      dbJobId
    });

    log.info("Job processing");

    await JobRepository.update(dbJobId, {
      status: "processing",
      startedAt: new Date()
    });

    try {
      const result = await run(topic);

      await JobRepository.update(dbJobId, {
        status: "completed",
        result,
        completedAt: new Date()
      });

      log.info("Job completed");
      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      // Only flip the DB row to "failed" once all BullMQ attempts are
      // exhausted; intermediate attempts stay in "processing" so the row
      // does not flap between states on every retry.
      const isFinalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      if (isFinalAttempt) {
        await JobRepository.update(dbJobId, {
          status: "failed",
          error: message,
          completedAt: new Date()
        });
        log.error(
          {
            err: error,
            attemptsMade: job.attemptsMade + 1
          },
          "Job failed (final attempt)"
        );
      } else {
        log.warn(
          {
            err: error,
            attemptsMade: job.attemptsMade + 1
          },
          "Job attempt failed; will retry"
        );
      }

      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// Publish processor
// ---------------------------------------------------------------------------
// Distinct from the AI makeProcessor because:
//   * Payload is { dbJobId, postId, workspaceId, platform } not topic
//   * On success/failure we mutate Post.publishResults[$platform] so the UI
//     can render a per-platform status grid without a separate query
//   * We decrypt the OAuth access token from SocialAccount before calling
//     the provider — ciphertext never leaves the @saas/db boundary otherwise
function makePublishProcessor(): Processor {
  return async (job) => {
    const payload = job.data as Partial<PublishJobPayload>;
    const { dbJobId, postId, workspaceId, platform } = payload;

    if (!dbJobId || !postId || !workspaceId || !platform) {
      throw new Error(
        `Publish job is missing required fields: ${JSON.stringify(payload)}`
      );
    }

    const log = logger.child({
      queue: job.queueName,
      bullJobId: job.id,
      dbJobId,
      postId,
      platform
    });

    await JobRepository.update(dbJobId, {
      status: "processing",
      startedAt: new Date()
    });

    // Helper to write a per-platform status block back onto the Post row.
    // Uses a $set on a dotted path so concurrent platform jobs don't
    // overwrite each other's results (Mongoose merges the partial $set).
    const writeResult = async (data: Record<string, unknown>) => {
      await PostModel.updateOne(
        { _id: postId, workspaceId },
        { $set: { [`publishResults.${platform}`]: data } }
      );
    };

    await writeResult({
      status: "publishing",
      startedAt: new Date()
    });

    try {
      const account = await SocialAccountRepository.findByPlatform(
        workspaceId,
        platform
      );
      if (!account) {
        throw new Error(
          `No ${platform} account connected for this workspace`
        );
      }

      const post = await PostRepository.findByIdAndWorkspace(
        postId,
        workspaceId
      );
      if (!post) throw new Error("Post not found");

      const provider = getProvider(platform as PlatformSlug);

      const acct = account as unknown as {
        accessTokenCipher: string;
        refreshTokenCipher?: string | null;
        externalAccountId: string;
        externalUsername?: string | null;
        metadata?: Record<string, unknown>;
      };

      const accessToken = decryptSecret(acct.accessTokenCipher);
      const refreshToken = acct.refreshTokenCipher
        ? decryptSecret(acct.refreshTokenCipher)
        : null;

      const publishResult = await provider.publish(
        {
          externalAccountId: acct.externalAccountId,
          externalUsername: acct.externalUsername,
          accessToken,
          refreshToken,
          metadata: acct.metadata
        },
        {
          id: String(post._id),
          workspaceId: post.workspaceId,
          title: post.title,
          content: post.content,
          imageUrl: post.imageUrl,
          videoUrl: post.videoUrl,
          hashtags: post.hashtags
        }
      );

      await writeResult({
        status: "success",
        externalId: publishResult.externalId,
        externalUrl: publishResult.externalUrl,
        publishedAt: publishResult.publishedAt
      });

      await JobRepository.update(dbJobId, {
        status: "completed",
        result: publishResult,
        completedAt: new Date()
      });

      log.info({ externalId: publishResult.externalId }, "Publish succeeded");
      return publishResult;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      const isFinalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      if (isFinalAttempt) {
        await writeResult({
          status: "failed",
          error: message,
          failedAt: new Date()
        });
        await JobRepository.update(dbJobId, {
          status: "failed",
          error: message,
          completedAt: new Date()
        });
        log.error({ err: error }, "Publish failed (final attempt)");
      } else {
        log.warn({ err: error }, "Publish attempt failed; will retry");
      }
      throw error;
    }
  };
}

const workers: Worker[] = [
  new Worker(
    AI_CONTENT_QUEUE_NAME,
    makeProcessor((topic) => contentAgent.generatePost(topic)),
    baseWorkerOptions
  ),

  new Worker(
    HASHTAG_QUEUE_NAME,
    makeProcessor((topic) => hashtagAgent.generateHashtags(topic)),
    baseWorkerOptions
  ),

  new Worker(
    IMAGE_QUEUE_NAME,
    makeProcessor((topic) => imageAgent.generateImagePrompt(topic)),
    baseWorkerOptions
  ),

  // Outbound publish worker \u2014 one job per (post, platform). Lives in the
  // same process as the AI workers so a single `apps/worker` deployment
  // owns the whole job graph. Uses a dedicated processor (not makeProcessor)
  // because its payload shape and result-handling differ from the topic-in /
  // string-out AI pattern \u2014 it loads + mutates the Post.publishResults map.
  new Worker(PUBLISH_QUEUE_NAME, makePublishProcessor(), {
    ...baseWorkerOptions,
    // Publish endpoints (FB, X, etc.) have per-account quotas \u2014 leave the
    // shared limiter in place so the worker doesn't slam any one platform
    // when a workspace publishes to 5 platforms at once.
    concurrency: Number(process.env.PUBLISH_WORKER_CONCURRENCY ?? 3)
  })
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    logger.error(
      {
        queue: worker.name,
        bullJobId: job?.id,
        err: err?.message
      },
      "BullMQ job failed"
    );
  });

  worker.on("error", (err) => {
    logger.error({ queue: worker.name, err }, "Worker error");
  });
}

// ---------------------------------------------------------------------------
// Stalled-job watchdog
// ---------------------------------------------------------------------------
// If a worker crashes while a job is in "processing" the DB row stays stuck
// forever. Every minute we look for rows that have been "processing" for
// longer than STALLED_JOB_TIMEOUT_MS and flip them to "failed" so the user
// can retry them through the API.
const STALLED_TIMEOUT_MS = Number(
  process.env.STALLED_JOB_TIMEOUT_MS ?? 10 * 60_000
);

const stalledInterval = setInterval(() => {
  JobRepository.markStalled(STALLED_TIMEOUT_MS).catch((err) => {
    logger.error({ err }, "Stalled-job sweep failed");
  });
}, 60_000);

// Don't block process exit waiting for this timer
stalledInterval.unref();

export async function shutdownWorkers() {
  logger.info("Shutting down workers...");
  clearInterval(stalledInterval);
  await Promise.allSettled(workers.map((w) => w.close()));
  logger.info("Workers closed");
}

export { workers };