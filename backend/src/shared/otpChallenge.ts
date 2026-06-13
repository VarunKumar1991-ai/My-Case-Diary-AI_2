import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { otpChallenges, otpPurposeEnum } from "../db/schema.js";
import { config } from "../config/index.js";
import { TooManyRequestsError, ValidationError } from "./errors.js";
import { generateId } from "./id.js";
import { generateOtpCode, hashOtpCode, otpSender, verifyOtpCode } from "./otp.js";

export type OtpPurpose = (typeof otpPurposeEnum.enumValues)[number];

const RESEND_COOLDOWN_SECONDS = 60;

async function findLatestChallenge(identifier: string, purpose: OtpPurpose) {
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.identifier, identifier), eq(otpChallenges.purpose, purpose)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  return challenge ?? null;
}

/**
 * Shared OTP-challenge lifecycle (issue + consume) backing every 6-digit step-up
 * flow: signup, signin, diary sharing, and visibility widening. Centralizing it
 * keeps the cooldown/attempt/expiry rules identical everywhere; purposes stay
 * non-interchangeable because every lookup is scoped to (identifier, purpose)
 * and each caller supplies its own `purpose` (my_prompt3.md §6.1).
 */
export async function issueOtpChallenge(identifier: string, purpose: OtpPurpose): Promise<void> {
  const recent = await findLatestChallenge(identifier, purpose);
  if (recent && !recent.consumedAt) {
    const secondsSinceIssue = (Date.now() - recent.createdAt.getTime()) / 1000;
    if (secondsSinceIssue < RESEND_COOLDOWN_SECONDS) {
      throw new TooManyRequestsError(
        `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceIssue)}s before requesting another code`,
      );
    }
  }

  const code = generateOtpCode();
  const hashedCode = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + config.otp.ttlMinutes * 60 * 1000);

  await db.insert(otpChallenges).values({
    id: generateId("otp"),
    identifier,
    hashedCode,
    purpose,
    expiresAt,
  });

  await otpSender.send(identifier, code, purpose);
}

export interface ConsumedOtpChallenge {
  id: string;
}

/** Returns the consumed challenge's id so callers can record an audit trail back to "which step-up authorized this" (e.g. `DiaryShare.otpChallengeId`). */
export async function consumeOtpChallenge(
  identifier: string,
  purpose: OtpPurpose,
  code: string,
  failureMessage: string,
): Promise<ConsumedOtpChallenge> {
  const challenge = await findLatestChallenge(identifier, purpose);

  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) {
    throw new ValidationError(failureMessage);
  }

  if (challenge.attempts >= config.otp.maxAttempts) {
    throw new TooManyRequestsError("Too many incorrect attempts. Please request a new code.");
  }

  const isMatch = await verifyOtpCode(code, challenge.hashedCode);
  if (!isMatch) {
    await db
      .update(otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(otpChallenges.id, challenge.id));
    throw new ValidationError(failureMessage);
  }

  await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(otpChallenges.id, challenge.id));

  return { id: challenge.id };
}
