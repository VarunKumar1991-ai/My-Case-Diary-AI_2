import type { Request, Response } from "express";
import { clearSessionCookies, setSessionCookies } from "../../shared/cookies.js";
import { UnauthorizedError } from "../../shared/errors.js";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifyAccessToken } from "../../shared/jwt.js";
import type { RequestContext } from "../../shared/http.js";
import {
  changePasswordSchema,
  resetPasswordSchema,
  signinPasswordSchema,
  signinRequestOtpSchema,
  signinVerifySchema,
  signupRequestOtpSchema,
  signupVerifySchema,
} from "./dto.js";
import {
  changeOwnPassword,
  recordLogout,
  refreshSession,
  requestSigninOtp,
  requestSignupOtp,
  resetPasswordWithCurrent,
  SIGNIN_OTP_REQUESTED_MESSAGE,
  signinWithPassword,
  verifySigninOtp,
  verifySignupOtp,
} from "./service.js";

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

export async function signupRequestOtp(req: Request, res: Response): Promise<void> {
  const input = signupRequestOtpSchema.parse(req.body);
  await requestSignupOtp(input, buildContext(req));
  res.status(202).json({ message: "An OTP has been sent to the contact details provided." });
}

export async function signupVerify(req: Request, res: Response): Promise<void> {
  const input = signupVerifySchema.parse(req.body);
  const session = await verifySignupOtp(input, buildContext(req));
  setSessionCookies(res, session.accessToken, session.refreshToken);
  res.status(201).json({ user: session.user });
}

export async function signinRequestOtp(req: Request, res: Response): Promise<void> {
  const input = signinRequestOtpSchema.parse(req.body);
  await requestSigninOtp(input, buildContext(req));
  res.status(202).json({ message: SIGNIN_OTP_REQUESTED_MESSAGE });
}

export async function signinVerify(req: Request, res: Response): Promise<void> {
  const input = signinVerifySchema.parse(req.body);
  const session = await verifySigninOtp(input, buildContext(req));
  setSessionCookies(res, session.accessToken, session.refreshToken);
  res.json({ user: session.user });
}

export async function signinPassword(req: Request, res: Response): Promise<void> {
  const input = signinPasswordSchema.parse(req.body);
  const session = await signinWithPassword(input, buildContext(req));
  setSessionCookies(res, session.accessToken, session.refreshToken);
  res.json({ user: session.user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const input = changePasswordSchema.parse(req.body);
  await changeOwnPassword(req.user.id, input, buildContext(req));
  res.status(204).send();
}

/**
 * "Forgot password?" on the sign-in screen. Unauthenticated but still requires
 * the current password, so it grants nothing a sign-in wouldn't already.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const input = resetPasswordSchema.parse(req.body);
  await resetPasswordWithCurrent(input, buildContext(req));
  res.status(204).send();
}

/**
 * Exchanges the refresh-token cookie for a fresh access/refresh pair (both
 * rotated) without requiring the user to re-enter an OTP. Lets the frontend
 * silently recover from an expired access token (`JWT_ACCESS_TTL_MINUTES`).
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new UnauthorizedError();

  const session = await refreshSession(token);
  setSessionCookies(res, session.accessToken, session.refreshToken);
  res.json({ user: session.user });
}

/**
 * Logout is idempotent and never fails on an absent/expired session — clearing
 * cookies must always succeed. Audit attribution is best-effort: we decode the
 * access token if present, but a missing/invalid token simply yields no actor.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      await recordLogout(payload.sub, buildContext(req));
    } catch {
      // Expired or malformed token — nothing to attribute, just clear cookies below.
    }
  }
  clearSessionCookies(res);
  res.status(204).send();
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  res.json({ user: req.user });
}
