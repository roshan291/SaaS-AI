import { Queue } from "bullmq";
import { redisConfig } from "../redis";
import { defaultJobOptions } from "./queue-options";

export const IMAGE_QUEUE_NAME = "ai-images";

export const imageQueue = new Queue(IMAGE_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions
});
