import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requestId } from "./request-id";

function makeCtx(headerValue?: string) {
  const headers = new Map<string, string>();
  if (headerValue) headers.set("x-request-id", headerValue);

  const req = {
    header: (n: string) => headers.get(n.toLowerCase())
  } as unknown as Request;

  const res = {
    setHeader: vi.fn()
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("requestId middleware", () => {
  it("generates a UUID when no incoming id is provided", () => {
    const { req, res, next } = makeCtx();
    requestId(req, res, next);

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe("string");
    // RFC 4122 v4 length
    expect((req.id as string).length).toBeGreaterThanOrEqual(32);
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", req.id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("preserves a valid incoming id", () => {
    const incoming = "abcd-1234.efgh_5678";
    const { req, res, next } = makeCtx(incoming);
    requestId(req, res, next);

    expect(req.id).toBe(incoming);
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", incoming);
    expect(next).toHaveBeenCalled();
  });

  it("rejects an invalid incoming id and generates a new one", () => {
    const { req, res, next } = makeCtx("not valid id with spaces!");
    requestId(req, res, next);

    expect(req.id).not.toBe("not valid id with spaces!");
    expect(req.id).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it("rejects an incoming id that is too short", () => {
    const { req, res, next } = makeCtx("abc");
    requestId(req, res, next);
    expect(req.id).not.toBe("abc");
  });
});
