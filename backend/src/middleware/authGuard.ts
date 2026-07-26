import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { ACCESS_COOKIE, verifyAccessToken } from "../shared/jwt.js";
import { PasswordChangeRequiredError, UnauthorizedError } from "../shared/errors.js";

export interface AuthenticatedUser {
  id: string;
  role: "OFFICER" | "ADMIN";
  accountStatus: "ACTIVE" | "BLOCKED";
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  mustChangePassword: boolean;
}

/**
 * The only requests reachable while an account still sits on the default
 * password: changing it, reading who you are, and signing out. Matched on
 * METHOD + path — `GET /me` is needed to render the screen, but `PATCH /me`
 * (profile edit) must stay blocked like everything else.
 */
const PASSWORD_CHANGE_ALLOWED = new Set(["POST /auth/password/change", "GET /me", "POST /auth/logout"]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the access-token cookie, re-loads the user from the DB (so a block
 * takes effect immediately rather than waiting for token expiry), and attaches
 * `req.user`. This is enforcement layer #1 of the RBAC defense-in-depth chain —
 * the service layer and DAL re-check independently (architecture.md §5).
 */
export async function authGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  let authenticated: AuthenticatedUser;

  try {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedError();

    const payload = verifyAccessToken(token);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

    if (!user) throw new UnauthorizedError();
    if (user.accountStatus === "BLOCKED") throw new UnauthorizedError("Account is blocked");

    authenticated = {
      id: user.id,
      role: user.role,
      accountStatus: user.accountStatus,
      name: user.name,
      designation: user.designation,
      email: user.email,
      mobile: user.mobile,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    next(new UnauthorizedError());
    return;
  }

  req.user = authenticated;

  // Enforcement layer for the forced first-login password change. Deliberately
  // outside the try above so it surfaces its own status/code rather than being
  // flattened into a 401 — the frontend routes on `PASSWORD_CHANGE_REQUIRED`.
  if (authenticated.mustChangePassword) {
    const path = (req.originalUrl ?? "").split("?")[0] ?? "";
    if (!PASSWORD_CHANGE_ALLOWED.has(`${req.method} ${path}`)) {
      next(new PasswordChangeRequiredError());
      return;
    }
  }

  next();
}
