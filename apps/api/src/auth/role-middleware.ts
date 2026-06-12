import type { NextFunction, Response } from "express";
import type { AuthRequest } from "@saas/shared";
import { Errors } from "../lib/respond";

export function allowRoles(roles: readonly string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      return next(Errors.forbidden("Insufficient role"));
    }

    next();
  };
}
