import { Queue } from "bullmq";

import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

// Queue name kept as a constant so producers (API) and consumers (worker)
// always agree on the BullMQ stream key.
export const AI_CONTENT_QUEUE_NAME = "ai-content";

// Content generation queue. The hashtag / image / video queues live in their
// own files (hashtag.queue.ts, image.queue.ts, video.queue.ts) and use the
// same shared `defaultJobOptions` so every queue gets identical retry +
// retention behavior.
export const aiQueue = new Queue(AI_CONTENT_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});
