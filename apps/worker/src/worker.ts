import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectMongo } from "@saas/db";
import { logger } from "./logger";

async function start() {
  await connectMongo();
  logger.info(
    {
      mongoState: mongoose.connection.readyState,
      db: mongoose.connection.db?.databaseName
    },
    "Mongo connected"
  );

  // Importing this module instantiates the four BullMQ Workers as a
  // side-effect. We use a dynamic import (instead of a top-level one) so the
  // Mongo connection is established before BullMQ starts processing jobs;
  // otherwise the first few jobs would try to persist before Mongo is ready.
  const { shutdownWorkers } = await import("./ai.worker.js");
  logger.info("Workers started");

  // Graceful shutdown — close workers first so in-flight jobs finish,
  // then close the DB connection so final BullMQ updates can persist.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    try {
      await shutdownWorkers();
      await mongoose.disconnect();
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((err) => {
  logger.fatal({ err }, "Worker failed to start");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection in worker");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception in worker");
  process.exit(1);
});
