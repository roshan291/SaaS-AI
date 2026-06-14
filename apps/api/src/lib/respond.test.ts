import { describe, it, expect } from "vitest";
import { AppError, Errors } from "./respond";

describe("AppError", () => {
  it("captures code, message, status and details", () => {
    const err = new AppError("MY_CODE", "boom", 418, { hint: "teapot" });
    expect(err.code).toBe("MY_CODE");
    expect(err.message).toBe("boom");
    expect(err.status).toBe(418);
    expect(err.details).toEqual({ hint: "teapot" });
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("Errors helpers", () => {
  it("notFound returns a 404", () => {
    const e = Errors.notFound("Job");
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("Job not found");
  });

  it("forbidden returns a 403", () => {
    expect(Errors.forbidden().status).toBe(403);
    expect(Errors.forbidden("custom").message).toBe("custom");
  });

  it("unauthorized returns a 401", () => {
    expect(Errors.unauthorized().status).toBe(401);
  });

  it("conflict returns a 409 with custom code", () => {
    const e = Errors.conflict("dup", "DUPE");
    expect(e.status).toBe(409);
    expect(e.code).toBe("DUPE");
  });

  it("validation returns a 400 with details", () => {
    const e = Errors.validation("bad", { field: "x" });
    expect(e.status).toBe(400);
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.details).toEqual({ field: "x" });
  });

  it("rateLimited returns a 429", () => {
    expect(Errors.rateLimited().status).toBe(429);
    expect(Errors.rateLimited().code).toBe("RATE_LIMITED");
  });
});
