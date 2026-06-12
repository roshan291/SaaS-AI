import { Request } from "express";

export interface AuthRequest
  extends Request {
  user?: {
    userId: string;
    workspaceId: string;
    role: string;
  };
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    workspaceId: string;
    role: string;
  };
}

 