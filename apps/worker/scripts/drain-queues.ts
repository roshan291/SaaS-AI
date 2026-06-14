// One-shot helper to clear out a stale BullMQ backlog so the worker can
// start fresh. Useful after rate-limit storms or when wiping a dev env.
//
// What it does:
//   1. Drains every AI queue (removes waiting + delayed jobs).
//   2. Marks every Mongo `Job` row currently in `queued` or `processing`
//      as `failed` so the dashboard reflects reality and clients can
//      retry through the normal API.
//
// What it does NOT do:
//   - Touch completed/failed history (so audit trail stays intact).
//   - Talk to Cloudinary (already-uploaded images stay where they are).
//
// Run with:  npx tsx apps/worker/scripts/drain-queues.ts
//
// Safe to run repeatedly; idempotent.
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import {
  aiQueue,
  hashtagQueue,
  imageQueue
} from "@saas/queue";
import { connectMongo, JobRepository } from "@saas/db";

async function main() {
  await connectMongo();

  const queues = [
    { name: "ai-content", q: aiQueue },
    { name: "ai-hashtags", q: hashtagQueue },
    { name: "ai-images", q: imageQueue }
  ];

  for (const { name, q } of queues) {
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    console.log(`[${name}] before:`, counts);

    // Drain removes waiting + delayed; pass `true` to also drop delayed.
    await q.drain(true);

    // Wipe failed history so a previous bad run doesn't keep retrying.
    await q.clean(0, 10_000, "failed");

    const after = await q.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    console.log(`[${name}] after :`, after);
  }

  const dbResult = await (
    JobRepository as unknown as {
      model: {
        updateMany(
          filter: unknown,
          update: unknown
        ): Promise<{ modifiedCount: number }>;
      };
    }
  ).model.updateMany(
    { status: { $in: ["queued", "processing"] } },
    {
      $set: {
        status: "failed",
        error: "Drained by maintenance script",
        completedAt: new Date()
      }
    }
  );

  console.log(
    `Marked ${dbResult.modifiedCount} stuck Mongo job rows as failed.`
  );

  await Promise.all(queues.map(({ q }) => q.close()));
  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Drain failed:", err);
  process.exit(1);
});
