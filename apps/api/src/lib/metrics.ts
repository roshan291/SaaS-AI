// Prometheus metrics for the API.
//
// Exposes a singleton `Registry` plus the handful of metrics our routes /
// middleware actually emit. Keep the cardinality low: every distinct value
// of every label becomes a separate time-series in Prometheus, so labels
// must be bounded sets (HTTP method, route template, status class), never
// user-supplied strings (URLs, ids, emails).

import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram
} from "prom-client";

export const registry = new Registry();

// Standard process metrics: cpu, memory, event-loop lag, gc, fd count.
collectDefaultMetrics({ register: registry });

// ---------------------------------------------------------------------------
// HTTP metrics
// ---------------------------------------------------------------------------

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests handled, partitioned by method, route and status",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry]
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  // Buckets tuned for an API serving sub-second responses with occasional
  // long-poll endpoints.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  labelNames: ["method", "route", "status"] as const,
  registers: [registry]
});

// ---------------------------------------------------------------------------
// AI job metrics (incremented from route handlers and audit emits)
// ---------------------------------------------------------------------------

export const aiJobsQueuedTotal = new Counter({
  name: "ai_jobs_queued_total",
  help: "Total AI jobs accepted by the API and pushed to BullMQ",
  labelNames: ["type"] as const, // content | hashtags | image
  registers: [registry]
});
