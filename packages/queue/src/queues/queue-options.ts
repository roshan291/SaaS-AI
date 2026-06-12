import type { JobsOptions } from "bullmq";

// Centralized, production-grade defaults for every queue.
//
// - attempts + exponential backoff: transient failures (network, rate limits,
//   model timeouts) get retried automatically.
// - removeOnComplete: keep the most recent N completed jobs in Redis for
//   observability; older ones are evicted so the cluster does not bloat.
// - removeOnFail: keep more failed jobs so they can be inspected / replayed.
export const defaultJobOptions: JobsOptions = {
  attempts: Number(process.env.QUEUE_JOB_ATTEMPTS ?? 5),

  backoff: {
    type: "exponential",
    delay: Number(process.env.QUEUE_JOB_BACKOFF_MS ?? 2000)
  },

  removeOnComplete: {
    count: Number(process.env.QUEUE_KEEP_COMPLETED ?? 1000),
    age: 60 * 60 * 24 // 24h
  },

  removeOnFail: {
    count: Number(process.env.QUEUE_KEEP_FAILED ?? 5000),
    age: 60 * 60 * 24 * 7 // 7 days
  }
};
