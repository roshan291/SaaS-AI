import { Worker } from "bullmq";

import { redisConfig } from "@saas/queue";
import { ContentAgent } from "../../../packages/agents/src";
import { JobRepository } from "@saas/db";

import mongoose from "mongoose";

console.log(
  "DB Name:",
  mongoose.connection.db?.databaseName
);

const agent = new ContentAgent();

const aiWorker = new Worker(
  "ai-content",

  async (job) => {

    console.log(
      "▶️ Processing Job:",
      job.id,
      "| topic:",
      job.data?.topic
    );

    console.log("================================");
    console.log("JOB DATA");
    console.log(job.data);
    console.log("================================");



    try {
      await JobRepository.update(
        job.data.dbJobId,
        {
          status: "processing",
          startedAt: new Date()
        }
      );

      const result =
        await agent.generatePost(
          job.data.topic
        );

      await JobRepository.update(
        job.data.dbJobId,
        {
          status: "completed",
          result,
          completedAt: new Date()
        }
      );

      return result;

    } catch (error: any) {

      await JobRepository.update(
        job.data.dbJobId,
        {
          status: "failed",
          error: error.message
        }
      );

      throw error;
    }
  },

  {
    connection: redisConfig,
    concurrency: 1
  }
);

export { aiWorker };