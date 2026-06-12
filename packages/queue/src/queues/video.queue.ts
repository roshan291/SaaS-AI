import { Queue } from "bullmq";
import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

export const VIDEO_QUEUE_NAME = "ai-videos";

export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});
