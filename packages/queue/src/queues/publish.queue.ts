// packages/queue/src/queues/publish.queue.ts
//
// Outbound publish queue \u2014 one BullMQ job per (post, platform) pair. The
// API fan-out service enqueues these in parallel; the worker (registered in
// apps/worker/src/ai.worker.ts) calls the corresponding @saas/integrations
// provider for each job.
//
// Kept on the same Redis connection / defaultJobOptions as the AI queues so
// retention + retry semantics stay consistent across the platform.

import { Queue } from "bullmq";
import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

export const PUBLISH_QUEUE_NAME = "post-publish";

export const publishQueue = new Queue(PUBLISH_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});

// Job payload contract \u2014 producers and the worker processor must agree on
// this shape, so we export it for typed enqueue() calls in the API layer.
export interface PublishJobPayload {
  dbJobId: string;
  postId: string;
  workspaceId: string;
  platform: "instagram" | "facebook" | "x" | "pinterest" | "youtube";
}
