import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Generate or accept a request id, expose it on the response header so clients
// can quote it in bug reports, and attach it to `req.id` for downstream
// logging and the response envelope.
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const incoming = req.header("x-request-id");
  const id =
    incoming && /^[A-Za-z0-9._-]{6,128}$/.test(incoming)
      ? incoming
      : randomUUID();

  req.id = id;
  res.setHeader("x-request-id", id);
  next();
}
