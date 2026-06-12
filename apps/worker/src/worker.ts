import dotenv from "dotenv";
dotenv.config();

import { connectMongo } from "@saas/db";

import mongoose from "mongoose";

console.log(
  "Mongo State:",
  mongoose.connection.readyState
);

console.log(
  "DB Name:",
  mongoose.connection.db?.databaseName
);

async function start() {
  await connectMongo();
  console.log("Mongo Connected");
  await import("./ai.worker");
  await import("./hashtag.worker");
  await import("./image.worker");
  await import("./video.worker");
  console.log("Worker Started");
}

start();

console.log("🚀 Worker Started");

process.on("unhandledRejection", (reason) => {
  console.error("🔥 Unhandled rejection in worker:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught exception in worker:", err);
});