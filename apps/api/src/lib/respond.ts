import type { Response } from "express";

// Standard success envelope. All routes should send via these helpers so the
// shape is uniform: `{ success: true, data, requestId?, message? }`.
// `message` is optional and intended for human-readable hints (e.g.
// "Returning existing job for idempotency key"); machine logic should rely
// on `data` and HTTP status.
export function respond<T>(
  res: Response,
  data: T,
  status: number = 200,
  message?: string
): Response {
  // `req.id` can be string | number depending on which middleware set it
  // (our request-id middleware uses a uuid string; pino-http may also set
  // a numeric id). Coerce so the response body always exposes a string.
  const rawId = res.req.id as unknown;
  const requestId =
    rawId == null ? undefined : String(rawId);

  const body: {
    success: true;
    data: T;
    requestId: string | undefined;
    message?: string;
  } = {
    success: true,
    data,
    requestId
  };

  if (message) body.message = message;

  return res.status(status).json(body);
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
