import { Response, NextFunction }from "express";
import { AuthRequest } from "@saas/shared";

import {
  verifyToken
} from "./jwt";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {

    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  const token =
    authHeader.replace(
      "Bearer ",
      ""
    );

  try {

    const payload = verifyToken(token);
    req.user = payload as AuthRequest["user"];

    next();

  } catch {

    return res.status(401).json({
      message: "Invalid token"
    });
  }
}