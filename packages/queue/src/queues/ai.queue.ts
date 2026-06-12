import { Queue } from "bullmq";
import { redisConfig } from "../redis";

export const aiQueue =
  new Queue(
    "ai-content",
    {
      connection: redisConfig
    }
  );

export const hashtagQueue =
  new Queue(
    "hashtag-content",
    {
      connection:
        redisConfig
    }
  );

  export const imageQueue =
  new Queue(
    "image-content",
    {
      connection:
        redisConfig
    }
  );

  export const videoQueue =
  new Queue(
    "video-content",
    {
      connection:
        redisConfig
    }
  );