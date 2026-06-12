import type {
  NextFunction,
  Request,
  Response
} from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { AppError } from "../lib/respond";
import { logger } from "../lib/logger";

interface ErrorPayload {
  success: false;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

// Centralized error handler. Maps known error types to a uniform envelope so
// clients (and SDKs / dashboards) can branch on `code` rather than parsing
// human-readable strings.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  let status = 500;
  const requestId = req.id != null ? String(req.id) : undefined;

  let payload: ErrorPayload = {
    success: false,
    code: "INTERNAL_ERROR",
    message: "Internal Server Error",
    requestId
  };

  if (err instanceof ZodError) {
    status = 400;
    payload = {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Invalid request body",
      details: err.flatten(),
      requestId
    };
  } else if (err instanceof AppError) {
    status = err.status;
    payload = {
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      requestId
    };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    payload = {
      success: false,
      code: "DB_VALIDATION_ERROR",
      message: "Database validation failed",
      details: err.errors,
      requestId
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    payload = {
      success: false,
      code: "INVALID_ID",
      message: `Invalid ${err.path}`,
      requestId
    };
  } else if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  ) {
    status = 409;
    payload = {
      success: false,
      code: "DUPLICATE_KEY",
      message: "Resource already exists",
      details: (err as { keyValue?: unknown }).keyValue,
      requestId
    };
  } else if (err instanceof Error) {
    payload = {
      ...payload,
      // Never leak raw error messages from unknown errors in production —
      // they may contain stack traces, connection strings, etc.
      message:
        process.env.NODE_ENV === "production"
          ? "Internal Server Error"
          : err.message
    };
  }

  // Always log the underlying error (with redaction applied by the logger).
  if (status >= 500) {
    logger.error({ err, requestId, path: req.path }, "Request failed");
  } else {
    logger.warn(
      { err, requestId, path: req.path, status },
      "Request rejected"
    );
  }

  res.status(status).json(payload);
}
