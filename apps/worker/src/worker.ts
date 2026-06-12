import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectMongo } from "@saas/db";

async function start() {
  await connectMongo();
  console.log("Mongo Connected");
  console.log("Mongo State:", mongoose.connection.readyState);
  console.log("DB Name:", mongoose.connection.db?.databaseName);

  // Importing this module instantiates the four BullMQ Workers as a
  // side-effect. We use a dynamic import (instead of a top-level one) so the
  // Mongo connection is established before BullMQ starts processing jobs;
  // otherwise the first few jobs would try to persist before Mongo is ready.
  const { shutdownWorkers } = await import("./ai.worker.js");
  console.log("🚀 Workers started");

  // Graceful shutdown — close workers first so in-flight jobs finish,
  // then close the DB connection so final BullMQ updates can persist.
  const shutdown = async (signal: string) => {
    console.log(`\n📥 Received ${signal}, shutting down gracefully`);
    try {
      await shutdownWorkers();
      await mongoose.disconnect();
    } catch (err) {
      console.error("Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 Unhandled rejection in worker:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught exception in worker:", err);
  process.exit(1);
});
