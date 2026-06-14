import type { Request, Response, NextFunction } from "express";
import {
  httpRequestsTotal,
  httpRequestDurationSeconds
} from "../lib/metrics";

// Stamp every request with timing + outcome counters. Uses `req.route?.path`
// (the route template, e.g. `/users/:id`) instead of `req.path` (the actual
// URL with values) so each route is a single time-series, not one per id.
//
// Falls back to `"unknown"` for unmatched routes (404s) so we still see them
// in the counter without exploding cardinality.
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const stop = httpRequestDurationSeconds.startTimer();

  res.on("finish", () => {
    const route =
      (req.route?.path as string | undefined) ??
      req.baseUrl ??
      "unknown";
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    stop(labels);
  });

  next();
}
