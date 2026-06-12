import { Router } from "express";
import mongoose from "mongoose";
import IORedis from "ioredis";
import { redisConfig } from "@saas/queue";

const router = Router();

// Liveness — process is up. Should NEVER touch external dependencies because
// Kubernetes / load-balancers kill pods that fail liveness.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Readiness — process is ready to serve traffic. Verify the dependencies the
// app cannot operate without (Mongo, Redis). Caches the redis client so we
// do not open a new connection on every probe.
let redisProbe: IORedis | null = null;
function getRedisProbe() {
  if (!redisProbe) {
    redisProbe = new IORedis({
      ...redisConfig,
      // Probe should fail fast rather than hang
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      enableOfflineQueue: false
    });
  }
  return redisProbe;
}

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, "ok" | "fail" | "unknown"> = {
    mongo: "unknown",
    redis: "unknown"
  };

  // Mongo: readyState 1 = connected.
  checks.mongo = mongoose.connection.readyState === 1 ? "ok" : "fail";

  try {
    const r = getRedisProbe();
    if (r.status === "end" || r.status === "wait") {
      await r.connect();
    }
    const pong = await r.ping();
    checks.redis = pong === "PONG" ? "ok" : "fail";
  } catch {
    checks.redis = "fail";
  }

  const allOk = Object.values(checks).every((s) => s === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "degraded",
    checks
  });
});

export default router;
