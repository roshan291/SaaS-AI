import { Queue } from "bullmq";
import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

export const HASHTAG_QUEUE_NAME = "ai-hashtags";

export const hashtagQueue = new Queue(HASHTAG_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});
