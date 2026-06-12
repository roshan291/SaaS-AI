import type { Request } from "express";

// Single source of truth for what `req.user` looks like after the
// `authMiddleware` runs. Keep in sync with `express.d.ts`.
export interface AuthUser {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
