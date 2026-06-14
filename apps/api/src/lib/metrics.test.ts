import { describe, it, expect } from "vitest";
import { registry, httpRequestsTotal, aiJobsQueuedTotal } from "./metrics";

describe("metrics registry", () => {
  it("exposes default process metrics", async () => {
    const text = await registry.metrics();
    // process_cpu_user_seconds_total is one of the built-in defaults.
    expect(text).toContain("process_cpu_user_seconds_total");
  });

  it("counts http requests by method/route/status", async () => {
    httpRequestsTotal.inc({ method: "GET", route: "/test", status: "200" });
    httpRequestsTotal.inc({ method: "GET", route: "/test", status: "200" });
    const text = await registry.metrics();
    expect(text).toMatch(
      /http_requests_total\{method="GET",route="\/test",status="200"\} 2/
    );
  });

  it("counts ai jobs by type", async () => {
    aiJobsQueuedTotal.inc({ type: "image" });
    const text = await registry.metrics();
    expect(text).toMatch(/ai_jobs_queued_total\{type="image"\} \d+/);
  });
});
