import { Queue } from "bullmq";

import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

// Queue name kept as a constant so producers (API) and consumers (worker)
// always agree on the BullMQ stream key.
export const AI_CONTENT_QUEUE_NAME = "ai-content";

// Content generation queue. The hashtag / image queues live in their own
// files (hashtag.queue.ts, image.queue.ts) and use the same shared
// `defaultJobOptions` so every queue gets identical retry + retention
// behavior. Video generation is parked until Phase 2.
export const aiQueue = new Queue(AI_CONTENT_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});
