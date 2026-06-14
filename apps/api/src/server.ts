import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import mongoose from "mongoose";

import { connectMongo } from "@saas/db";

import postRoutes from "./routes/post.routes";
import workspaceRoutes from "./routes/workspace.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./auth/auth-routes";
import aiGenerateRoutes from "../v1/ai/generate";
import jobRoutes from "../v1/job";
import hashtagRoutes from "./routes/hashtag-routes";
import aiImageGenerateRoutes from "./routes/image-routes";
import auditLogRoutes from "./routes/audit-log.routes";
import healthRoutes from "./routes/health.routes";
import metricsRoutes from "./routes/metrics.routes";
import testRoutes from "./routes/test.routes";

import { mountSwagger } from "./docs/swagger";
import { errorHandler } from "./middlewares/error-handler";
import { requestId } from "./middlewares/request-id";
import { metricsMiddleware } from "./middlewares/metrics-middleware";
import { logger } from "./lib/logger";
import { respondError } from "./lib/respond";

const app = express();

// Express 5 sets `query parser` to "simple" by default, which is fine. Trust
// the immediate proxy for `x-forwarded-for` / req.ip so rate-limit + audit
// captures the real client IP behind a load balancer.
app.set("trust proxy", 1);

// -----------------------------------------------------------------------------
// Middleware (order matters)
// -----------------------------------------------------------------------------

// 1. Correlate every request with a stable id (incoming or generated)
app.use(requestId);

// 1b. Prometheus metrics — record duration + status for every request.
// Mounted before logging so 4xx/5xx still produce metrics even if the
// logger errors out.
app.use(metricsMiddleware);

// 2. Structured logging with request id + redaction (lib/logger sets redact)
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: (req as unknown as { id?: string }).id
    }),
    serializers: {
      req: (req: { id?: string; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url
      })
    }
  })
);

// 3. Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // API does not serve HTML; CSP not applicable
    crossOriginResourcePolicy: { policy: "same-site" }
  })
);

// 4. CORS allowlist. `ALLOWED_ORIGINS` is a CSV. If unset in dev, allow all.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Non-browser / same-origin requests have no Origin header
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    maxAge: 86400
  })
);

// 5. Body parsing — keep tight. JSON only. Reject oversized payloads.
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT ?? "100kb"
  })
);

// 6. Global rate limit. Per-route stricter limits live on /auth/*.
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    limit: Number(process.env.RATE_LIMIT_MAX ?? 300),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      code: "RATE_LIMITED",
      message: "Too many requests, please slow down"
    }
  })
);

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "saas-api" });
});

// Health probes are unauthenticated and mounted under /api/v1 for consistency
app.use("/api/v1", healthRoutes);

// Prometheus metrics. Auth handled inside the route based on env config.
app.use("/api/v1", metricsRoutes);

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/posts", postRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workspaces", workspaceRoutes);
app.use("/api/v1/ai", aiGenerateRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/hashtags", hashtagRoutes);
app.use("/api/v1/images", aiImageGenerateRoutes);
app.use("/api/v1/audit-logs", auditLogRoutes);
app.use("/api/v1/test", testRoutes);

// Swagger UI at /api/docs and machine-readable spec at /api/docs.json.
// Safe to expose publicly in dev; gate behind an env flag in production.
if (process.env.NODE_ENV !== "production" || process.env.EXPOSE_DOCS === "true") {
  mountSwagger(app, "/api/docs");
}

// 404 — must come after all routes but before error handler
app.use((req, res) => {
  respondError(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    "NOT_FOUND",
    404
  );
});

// Error handler (last)
app.use(errorHandler);

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 4000);

async function start() {
  try {
    await connectMongo();
    logger.info("Mongo connected");
  } catch (err) {
    logger.fatal({ err }, "Failed to connect to Mongo");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "API started");
  });

  // Graceful shutdown — drain in-flight HTTP, then disconnect from Mongo.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down API");
    server.close(async () => {
      try {
        await mongoose.disconnect();
      } catch (err) {
        logger.error({ err }, "Error disconnecting Mongo");
      }
      process.exit(0);
    });

    // Hard exit if graceful shutdown does not complete in 15s
    setTimeout(() => {
      logger.warn("Force exit after 15s shutdown timeout");
      process.exit(1);
    }, 15_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — exiting");
    process.exit(1);
  });
}

void start();
