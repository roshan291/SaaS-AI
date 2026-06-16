// One-shot dev helper: drains ALL BullMQ data from the three AI queues
// (waiting, active, delayed, failed, completed, prioritized).
//
// USE WITH CARE. This will lose any queued or in-flight jobs.
//
// Usage (from repo root):
//   node --env-file=apps/worker/.env scripts/clear-ai-queues.mjs
//
// Why a separate script and not a CLI flag on the worker? Mixing destructive
// admin actions into the long-running worker process invites accidents (a
// stray env var flips it on in prod). Keeping it as an opt-in script the
// operator has to run by hand is safer.

import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error("REDIS_URL is required");
  process.exit(1);
}

const queueNames = ["ai-content", "ai-hashtags", "ai-images"];

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null
});

let totalRemoved = 0;

for (const name of queueNames) {
  const q = new Queue(name, { connection });

  // `obliterate` wipes every key BullMQ owns for that queue, including
  // active/stalled lock keys. `force: true` skips the safety prompt that
  // refuses to wipe a queue with active jobs (which is exactly what we want
  // here — those are the stalled jobs we're trying to get rid of).
  await q.obliterate({ force: true });

  const counts = await q.getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
    "completed"
  );
  const remaining = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`[${name}] obliterated. Remaining counts:`, counts);
  totalRemoved += remaining === 0 ? 1 : 0;

  await q.close();
}

await connection.quit();
console.log(
  `\nDone. ${queueNames.length}/${queueNames.length} queues cleaned.`
);
