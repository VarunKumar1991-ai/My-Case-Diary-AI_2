import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../shared/errors.js";
import type { AuthenticatedUser } from "./authGuard.js";

/**
 * Enforcement layer #2: confirms the authenticated user holds one of the allowed
 * roles. Always runs after `authGuard`. Route-level rejection here is the first
 * line of defense — services and the DAL re-check ownership/role independently.
 */
export function requireRole(...roles: Array<AuthenticatedUser["role"]>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
