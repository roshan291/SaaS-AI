import type { Response } from "express";

// Standard success envelope. All routes should send via these helpers so the
// shape is uniform: `{ success: true, data, requestId? }`.
export function respond<T>(
  res: Response,
  data: T,
  status: number = 200
): Response {
  return res.status(status).json({
    success: true,
    data,
    requestId: res.req.id
  });
}

// Standard error envelope. The global error handler emits the same shape.
export function respondError(
  res: Response,
  message: string,
  code: string,
  status: number = 400,
  details?: unknown
): Response {
  return res.status(status).json({
    success: false,
    code,
    message,
    details,
    requestId: res.req.id
  });
}

// Generic application error with a stable code. Throw these from services to
// get a well-shaped response without try/catch in every route.
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  notFound: (resource: string) =>
    new AppError("NOT_FOUND", `${resource} not found`, 404),
  forbidden: (msg = "Forbidden") =>
    new AppError("FORBIDDEN", msg, 403),
  unauthorized: (msg = "Unauthorized") =>
    new AppError("UNAUTHORIZED", msg, 401),
  conflict: (msg: string, code = "CONFLICT") =>
    new AppError(code, msg, 409),
  validation: (msg: string, details?: unknown) =>
    new AppError("VALIDATION_ERROR", msg, 400, details),
  rateLimited: (msg = "Too many requests") =>
    new AppError("RATE_LIMITED", msg, 429)
};
