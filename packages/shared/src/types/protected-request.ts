// packages/shared/src/types/protected-request.ts

import { Request } from "express";

export interface ProtectedRequest
  extends Request {

  user: {
    userId: string;
    workspaceId: string;
    role: string;
  };
}