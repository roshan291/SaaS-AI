// packages/shared/src/types/protected-request.ts

import type { Request } from "express";
import type { AuthUser } from "./auth-request";

// `ProtectedRequest` asserts `user` is present (non-optional). Use this in
// handlers that are mounted behind `authMiddleware` so TypeScript stops
// requiring `req.user!` everywhere.
export interface ProtectedRequest extends Request {
  user: AuthUser;
}
