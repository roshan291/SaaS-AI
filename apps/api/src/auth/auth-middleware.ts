import type { NextFunction, Response } from "express";
import type { AuthRequest } from "@saas/shared";

import { verifyToken } from "./jwt";
import { Errors } from "../lib/respond";

export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(Errors.unauthorized("Missing Bearer token"));
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return next(Errors.unauthorized("Empty token"));
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      role: payload.role
    };
    next();
  } catch {
    return next(Errors.unauthorized("Invalid or expired token"));
  }
}
