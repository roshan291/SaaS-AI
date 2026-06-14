import { Router, type Request, type Response } from "express";
import { registry } from "../lib/metrics";

const router = Router();

// Prometheus scrape endpoint.
//
// Default behaviour: open in dev, gated in production by either
// `EXPOSE_METRICS=true` OR a shared-secret bearer token in
// `METRICS_BEARER_TOKEN`. When neither is set in production the route
// returns 404 — clients see nothing different from a missing route.
router.get("/metrics", async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === "production";
  const exposeFlag = process.env.EXPOSE_METRICS === "true";
  const expectedToken = process.env.METRICS_BEARER_TOKEN;

  if (isProd && !exposeFlag) {
    if (!expectedToken) {
      // Not configured — pretend the route doesn't exist.
      return res.status(404).end();
    }
    const auth = req.header("authorization") ?? "";
    const provided = auth.startsWith("Bearer ")
      ? auth.slice("Bearer ".length)
      : "";
    if (provided !== expectedToken) {
      return res.status(401).end();
    }
  }

  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
});

export default router;
