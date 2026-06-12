import "express";
import type { AuthUser } from "./auth-request";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      // Set by the request-id middleware so every log line + outgoing header
      // can correlate.
      id?: string;
    }
  }
}
