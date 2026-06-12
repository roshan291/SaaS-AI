import { Worker } from "bullmq";

import {
  redisConfig
} from "@saas/queue";

import {
  VideoAgent
} from "@saas/agents";

import {
  JobRepository
} from "@saas/db";

const agent =
  new VideoAgent();

new Worker(
  "video-content",

  async (job) => {

    try {

      await JobRepository.update(
        job.data.dbJobId,
        {
          status:
            "processing",

          startedAt:
            new Date()
        }
      );

      const result =
        await agent.generateVideoScript(
          job.data.topic
        );

      await JobRepository.update(
        job.data.dbJobId,
        {
          status:
            "completed",

          result,

          completedAt:
            new Date()
        }
      );

      return result;

    } catch (error: any) {

      await JobRepository.update(
        job.data.dbJobId,
        {
          status:
            "failed",

          error:
            error.message
        }
      );

      throw error;
    }
  },

  {
    connection:
      redisConfig
  }
);