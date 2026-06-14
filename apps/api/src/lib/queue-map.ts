// Central map from job `type` to the BullMQ queue + job name to enqueue on.
// Used by:
//   - the AI generation endpoints (initial submission)
//   - the `/jobs/:id/retry` endpoint (so a retry goes to the *original* queue,
//     not always the content queue)
//
// Keep job-type strings in sync with the values written by routes:
//   `content`  → AI content / post generation
//   `hashtags` → hashtag generation
//   `image`    → image-prompt generation
//
// `video` is parked until Phase 2 — re-add the queue + entry here when the
// video pipeline ships.
import {
  aiQueue,
  hashtagQueue,
  imageQueue
} from "@saas/queue";
import type { Queue } from "bullmq";

export type JobType = "content" | "hashtags" | "image";

interface QueueDescriptor {
  queue: Queue;
  jobName: string;
}

export const JOB_TYPE_QUEUE_MAP: Record<JobType, QueueDescriptor> = {
  content: { queue: aiQueue, jobName: "generate-post" },
  hashtags: { queue: hashtagQueue, jobName: "generate-hashtags" },
  image: { queue: imageQueue, jobName: "generate-image" }
};

export function isJobType(value: unknown): value is JobType {
  return (
    typeof value === "string" &&
    value in JOB_TYPE_QUEUE_MAP
  );
}
