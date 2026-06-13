import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { ConflictError, UnauthorizedError, ValidationError } from "../../shared/errors.js";
import { normalizeIndianMobile } from "../../shared/mobile.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/jwt.js";
import type { RequestContext } from "../../shared/http.js";
import { consumeOtpChallenge, issueOtpChallenge } from "../../shared/otpChallenge.js";
import { recordAuditEntry } from "../audit/service.js";
import { toPublicUser, type PublicUser } from "../user/service.js";
import type {
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

function issueSession(user: typeof users.$inferSelect): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id, tokenId: randomUUID() }),
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

  const { accessToken, refreshToken } = issueSession(user);

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

  const { accessToken, refreshToken } = issueSession(user);

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

  const { accessToken, refreshToken: nextRefreshToken } = issueSession(user);
  return { user: toPublicUser(user), accessToken, refreshToken: nextRefreshToken };
}

// ── Logout ─────────────────────────────────────────────────────────────────

export async function recordLogout(userId: string, context: RequestContext): Promise<void> {
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
