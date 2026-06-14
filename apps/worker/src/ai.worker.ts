import { Worker, type Processor } from "bullmq";

import {
  redisConfig,
  AI_CONTENT_QUEUE_NAME,
  HASHTAG_QUEUE_NAME,
  IMAGE_QUEUE_NAME
} from "@saas/queue";

import {
  ContentAgent,
  HashtagAgent,
  ImageAgent
} from "@saas/agents";

import { JobRepository } from "@saas/db";
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

const workers: Worker[] = [
  new Worker(
    AI_CONTENT_QUEUE_NAME,
    makeProcessor((topic) => contentAgent.generatePost(topic)),
    { connection: redisConfig, concurrency, limiter }
  ),

  new Worker(
    HASHTAG_QUEUE_NAME,
    makeProcessor((topic) => hashtagAgent.generateHashtags(topic)),
    { connection: redisConfig, concurrency, limiter }
  ),

  new Worker(
    IMAGE_QUEUE_NAME,
    makeProcessor((topic) => imageAgent.generateImagePrompt(topic)),
    { connection: redisConfig, concurrency, limiter }
  )
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