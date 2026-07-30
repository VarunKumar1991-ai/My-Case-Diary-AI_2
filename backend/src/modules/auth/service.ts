import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../shared/errors.js";
import { normalizeIndianMobile } from "../../shared/mobile.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/jwt.js";
import type { RequestContext } from "../../shared/http.js";
import { consumeOtpChallenge, issueOtpChallenge } from "../../shared/otpChallenge.js";
import { DEFAULT_PASSWORD, hashPassword, verifyPassword } from "../../shared/password.js";
import { recordAuditEntry } from "../audit/service.js";
import { toPublicUser, type PublicUser } from "../user/service.js";
import type {
  ChangePasswordInput,
  ResetPasswordInput,
  SigninPasswordInput,
  SigninRequestOtpInput,
  SigninVerifyInput,
  SignupRequestOtpInput,
  SignupVerifyInput,
} from "./dto.js";

/**
 * Both failure paths (wrong code vs. unknown/blocked account) return this exact
 * message so a caller cannot distinguish "no such account" from "bad code"
 * (my_prompt3.md §6.1: never reveal whether a block is account-specific).
 */
const GENERIC_OTP_FAILURE = "The code is incorrect or has expired. Please request a new one.";

/** Returned for every sign-in OTP request, whether or not the account exists or is active. */
export const SIGNIN_OTP_REQUESTED_MESSAGE =
  "If an account exists for the details provided, an OTP has been sent.";

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

interface ResolvedIdentifier {
  identifier: string;
  email: string | null;
  mobile: string | null;
}

/**
 * Mobile is treated as the primary OTP channel for field officers; when both an
 * email and a mobile are supplied, the mobile becomes the canonical `identifier`
 * so a single challenge — and a single rate-limit bucket — governs the request.
 */
function resolveIdentifier(input: { email?: string; mobile?: string }): ResolvedIdentifier {
  const email = input.email?.trim().toLowerCase() || null;
  let mobile: string | null = null;

  if (input.mobile?.trim()) {
    const normalized = normalizeIndianMobile(input.mobile);
    if (!normalized) {
      throw new ValidationError("Enter a valid 10-digit Indian mobile number");
    }
    mobile = normalized;
  }

  if (!email && !mobile) {
    throw new ValidationError("Provide an email or a mobile number");
  }

  return { identifier: mobile ?? email!, email, mobile };
}

async function findUserByIdentifier(email: string | null, mobile: string | null) {
  const conditions = [];
  if (email) conditions.push(eq(users.email, email));
  if (mobile) conditions.push(eq(users.mobile, mobile));
  if (conditions.length === 0) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(or(...conditions))
    .limit(1);
  return user ?? null;
}

async function assertIdentifierAvailable(pno: string, email: string | null, mobile: string | null) {
  const [existingByPno] = await db.select().from(users).where(eq(users.id, pno)).limit(1);
  if (existingByPno) {
    throw new ConflictError("An account with this PNO already exists. Please sign in instead.");
  }

  const existingByContact = await findUserByIdentifier(email, mobile);
  if (existingByContact) {
    throw new ConflictError(
      "An account with this email or mobile number already exists. Please sign in instead.",
    );
  }
}

/**
 * Issues a fresh session and records it as *the* session for this account —
 * one device signed in at a time. Persisting the id here (rather than only
 * embedding it in the tokens) is what lets `authGuard` silently invalidate
 * whatever was previously signed in, on that device's very next request.
 */
async function issueSession(user: typeof users.$inferSelect): Promise<{ accessToken: string; refreshToken: string }> {
  const sessionId = randomUUID();
  await db.update(users).set({ currentSessionId: sessionId }).where(eq(users.id, user.id));
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, sessionId }),
    refreshToken: signRefreshToken({ sub: user.id, sessionId }),
  };
}

// ── Signup ─────────────────────────────────────────────────────────────────

export async function requestSignupOtp(
  input: SignupRequestOtpInput,
  context: RequestContext,
): Promise<void> {
  const { identifier, email, mobile } = resolveIdentifier(input);
  const pno = input.pno.trim();
  await assertIdentifierAvailable(pno, email, mobile);
  await issueOtpChallenge(identifier, "signup");

  await recordAuditEntry({
    actorId: null,
    action: "auth.signup.otp_requested",
    resourceType: "user",
    resourceId: pno,
    metadata: { identifier },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export async function verifySignupOtp(
  input: SignupVerifyInput,
  context: RequestContext,
): Promise<AuthSession> {
  const { identifier, email, mobile } = resolveIdentifier(input);
  const pno = input.pno.trim();

  await consumeOtpChallenge(identifier, "signup", input.code, GENERIC_OTP_FAILURE);

  // Re-check uniqueness at creation time to close the signup race window between
  // OTP request and verification (two requests racing for the same PNO/contact).
  await assertIdentifierAvailable(pno, email, mobile);

  const [user] = await db
    .insert(users)
    .values({
      id: pno,
      name: input.name.trim(),
      email,
      mobile,
      role: "OFFICER",
      accountStatus: "ACTIVE",
    })
    .returning();

  if (!user) throw new ValidationError("Could not create the account. Please try again.");

  const { accessToken, refreshToken } = await issueSession(user);

  await recordAuditEntry({
    actorId: user.id,
    action: "auth.signup.completed",
    resourceType: "user",
    resourceId: user.id,
    metadata: { identifier },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

// ── Signin ─────────────────────────────────────────────────────────────────

export async function requestSigninOtp(
  input: SigninRequestOtpInput,
  context: RequestContext,
): Promise<void> {
  const { identifier, email, mobile } = resolveIdentifier(input);
  const user = await findUserByIdentifier(email, mobile);

  // Enumeration-resistant: a code is only ever issued to a known, ACTIVE account,
  // but the caller always receives the same acknowledgement either way.
  if (user && user.accountStatus === "ACTIVE") {
    await issueOtpChallenge(identifier, "signin");
    await recordAuditEntry({
      actorId: user.id,
      action: "auth.signin.otp_requested",
      resourceType: "user",
      resourceId: user.id,
      metadata: { identifier },
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return;
  }

  await recordAuditEntry({
    actorId: null,
    action: "auth.signin.otp_requested_unknown_or_blocked",
    resourceType: "user",
    resourceId: user?.id ?? null,
    metadata: { identifier },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export async function verifySigninOtp(
  input: SigninVerifyInput,
  context: RequestContext,
): Promise<AuthSession> {
  const { identifier, email, mobile } = resolveIdentifier(input);
  const user = await findUserByIdentifier(email, mobile);

  if (!user || user.accountStatus !== "ACTIVE") {
    // Identical failure for "no such account", "blocked account", and "wrong code" —
    // never reveal which (my_prompt3.md §6.1).
    throw new ValidationError(GENERIC_OTP_FAILURE);
  }

  await consumeOtpChallenge(identifier, "signin", input.code, GENERIC_OTP_FAILURE);

  const { accessToken, refreshToken } = await issueSession(user);

  await recordAuditEntry({
    actorId: user.id,
    action: "auth.signin.completed",
    resourceType: "user",
    resourceId: user.id,
    metadata: { identifier },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

// ── Password sign-in ───────────────────────────────────────────────────────

/**
 * Same message for unknown account, blocked account, and wrong password, so the
 * endpoint can't be used to discover which PNOs/emails exist (mirrors the OTP path).
 */
const GENERIC_PASSWORD_FAILURE = "The ID or password is incorrect.";

/**
 * Officers may identify themselves by either half of what they already know:
 * their PNO (the user id) or their registered email. Anything containing "@" is
 * treated as an email; everything else as a PNO.
 */
async function findUserByPnoOrEmail(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(trimmed.includes("@") ? eq(users.email, trimmed.toLowerCase()) : eq(users.id, trimmed))
    .limit(1);
  return user ?? null;
}

/**
 * Resolves an identifier + password to an account, or throws the shared generic
 * failure. Used by both password sign-in and the self-service password reset.
 */
async function authenticateWithPassword(identifier: string, password: string) {
  const user = await findUserByPnoOrEmail(identifier);

  if (!user || user.accountStatus !== "ACTIVE" || !user.passwordHash) {
    throw new ValidationError(GENERIC_PASSWORD_FAILURE);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new ValidationError(GENERIC_PASSWORD_FAILURE);

  return user;
}

/** Signs in with the officer's PNO or email, plus their password. */
export async function signinWithPassword(
  input: SigninPasswordInput,
  context: RequestContext,
): Promise<AuthSession> {
  const user = await authenticateWithPassword(input.identifier, input.password);

  const { accessToken, refreshToken } = await issueSession(user);

  await recordAuditEntry({
    actorId: user.id,
    action: "auth.signin.password.completed",
    resourceType: "user",
    resourceId: user.id,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { user: toPublicUser(user), accessToken, refreshToken };
}

/**
 * Writes a new password and clears the forced-change flag. Shared by the
 * signed-in change and the sign-in-screen reset so both enforce the same rule:
 * the shared default can never be chosen as the new password.
 */
async function applyNewPassword(
  userId: string,
  newPassword: string,
  action: string,
  context: RequestContext,
): Promise<void> {
  if (newPassword === DEFAULT_PASSWORD) {
    throw new ValidationError("Choose a password other than the default one.");
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, userId));

  await recordAuditEntry({
    actorId: userId,
    action,
    resourceType: "user",
    resourceId: userId,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

/** Changes the signed-in officer's own password (current password required). */
export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
  context: RequestContext,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.accountStatus !== "ACTIVE") throw new UnauthorizedError();

  const ok = user.passwordHash ? await verifyPassword(input.currentPassword, user.passwordHash) : false;
  if (!ok) {
    throw new ValidationError("Your current password is incorrect.");
  }

  await applyNewPassword(userId, input.newPassword, "auth.password.changed", context);
}

/**
 * Self-service reset from the sign-in screen ("Forgot password?"), for officers
 * who remember their current password but want a new one without signing in
 * first. Requires the current password, so it is exactly as strong as a sign-in
 * — an officer who has genuinely forgotten it must ask an ADMIN to reset.
 */
export async function resetPasswordWithCurrent(
  input: ResetPasswordInput,
  context: RequestContext,
): Promise<void> {
  const user = await authenticateWithPassword(input.identifier, input.currentPassword);
  await applyNewPassword(user.id, input.newPassword, "auth.password.reset_self", context);
}

// ── Refresh ────────────────────────────────────────────────────────────────

/**
 * Exchanges a valid refresh token for a new session (access + refresh token,
 * both rotated). Re-loads the user so a block since the last refresh takes
 * effect immediately, matching the `authGuard` check on the access token.
 */
export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError();
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || user.accountStatus !== "ACTIVE") throw new UnauthorizedError();

  // Single-session enforcement: a refresh token from a device that has since
  // been superseded by a sign-in elsewhere must not be able to mint a new one.
  if (user.currentSessionId !== payload.sessionId) throw new UnauthorizedError();

  const { accessToken, refreshToken: nextRefreshToken } = await issueSession(user);
  return { user: toPublicUser(user), accessToken, refreshToken: nextRefreshToken };
}

// ── Logout ─────────────────────────────────────────────────────────────────

/**
 * Clears `currentSessionId` only if it still matches the token being logged
 * out — a stale/already-superseded device logging out must not clear the
 * *new* session that replaced it elsewhere.
 */
export async function recordLogout(userId: string, sessionId: string | undefined, context: RequestContext): Promise<void> {
  if (sessionId) {
    await db
      .update(users)
      .set({ currentSessionId: null })
      .where(and(eq(users.id, userId), eq(users.currentSessionId, sessionId)));
  }

  await recordAuditEntry({
    actorId: userId,
    action: "auth.logout",
    resourceType: "user",
    resourceId: userId,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });
}
