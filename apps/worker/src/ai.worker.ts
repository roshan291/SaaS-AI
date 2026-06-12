import { Worker, type Processor } from "bullmq";

import {
  redisConfig,
  AI_CONTENT_QUEUE_NAME,
  HASHTAG_QUEUE_NAME,
  IMAGE_QUEUE_NAME,
  VIDEO_QUEUE_NAME
} from "@saas/queue";

import {
  ContentAgent,
  HashtagAgent,
  ImageAgent,
  VideoAgent
} from "@saas/agents";

import { JobRepository } from "@saas/db";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

const contentAgent = new ContentAgent();
const hashtagAgent = new HashtagAgent();
const imageAgent = new ImageAgent();
const videoAgent = new VideoAgent();

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

    console.log(
      `▶️  Processing ${job.queueName} job ${job.id} (db=${dbJobId})`
    );

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
      }

      throw error;
    }
  };
}

const workers: Worker[] = [
  new Worker(
    AI_CONTENT_QUEUE_NAME,
    makeProcessor((topic) => contentAgent.generatePost(topic)),
    { connection: redisConfig, concurrency }
  ),

  new Worker(
    HASHTAG_QUEUE_NAME,
    makeProcessor((topic) => hashtagAgent.generateHashtags(topic)),
    { connection: redisConfig, concurrency }
  ),

  new Worker(
    IMAGE_QUEUE_NAME,
    makeProcessor((topic) => imageAgent.generateImagePrompt(topic)),
    { connection: redisConfig, concurrency }
  ),

  new Worker(
    VIDEO_QUEUE_NAME,
    makeProcessor((topic) => videoAgent.generateVideoScript(topic)),
    { connection: redisConfig, concurrency }
  )
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    console.error(
      `❌ Job ${job?.id} on ${worker.name} failed:`,
      err?.message
    );
  });

  worker.on("error", (err) => {
    console.error(`🔥 Worker ${worker.name} error:`, err);
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
    console.error("Stalled-job sweep failed:", err);
  });
}, 60_000);

// Don't block process exit waiting for this timer
stalledInterval.unref();

export async function shutdownWorkers() {
  console.log("🛑 Shutting down workers...");
  clearInterval(stalledInterval);
  await Promise.allSettled(workers.map((w) => w.close()));
  console.log("✅ Workers closed");
}

export { workers };