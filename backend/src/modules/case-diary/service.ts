import { and, desc, eq, gt, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  caseDiaries,
  caseDiaryRevisions,
  caseTypes,
  diaryShares,
  privateAccessApprovals,
  users,
} from "../../db/schema.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { generateId } from "../../shared/id.js";
import type { RequestContext } from "../../shared/http.js";
import { consumeOtpChallenge, issueOtpChallenge } from "../../shared/otpChallenge.js";
import type { AuthenticatedUser } from "../../middleware/authGuard.js";
import { recordAuditEntry } from "../audit/service.js";
import type {
  CreateCaseDiaryInput,
  ListCaseDiariesQuery,
  ShareConfirmInput,
  ShareRequestOtpInput,
  UpdateCaseDiaryInput,
  VisibilityConfirmInput,
  VisibilityRequestOtpInput,
} from "./dto.js";

type CaseDiaryRow = typeof caseDiaries.$inferSelect;

const CASE_DIARY_NO_PATTERN = /^CD-(\d+)$/;

const GENERIC_OTP_FAILURE = "The code is incorrect or has expired. Please request a new one.";

/**
 * `caseDiaryNo` is a per-officer sequence (D4): we look at the officer's existing
 * numbers, take the highest `CD-NNN` suffix we can parse, and increment. Because
 * the number is officer-editable (§6.2), we tolerate rows that no longer match
 * the pattern — they simply don't influence the next default.
 */
export async function generateNextCaseDiaryNo(ownerId: string): Promise<string> {
  const rows = await db
    .select({ caseDiaryNo: caseDiaries.caseDiaryNo })
    .from(caseDiaries)
    .where(eq(caseDiaries.ownerId, ownerId));

  let highest = 0;
  for (const row of rows) {
    const match = CASE_DIARY_NO_PATTERN.exec(row.caseDiaryNo);
    const captured = match?.[1];
    if (captured) highest = Math.max(highest, Number.parseInt(captured, 10));
  }

  return `CD-${String(highest + 1).padStart(3, "0")}`;
}

async function assertCaseDiaryNoAvailable(
  ownerId: string,
  caseDiaryNo: string,
  excludeDiaryId: string | null,
): Promise<void> {
  const [existing] = await db
    .select({ id: caseDiaries.id })
    .from(caseDiaries)
    .where(and(eq(caseDiaries.ownerId, ownerId), eq(caseDiaries.caseDiaryNo, caseDiaryNo)))
    .limit(1);

  if (existing && existing.id !== excludeDiaryId) {
    throw new ConflictError(`You already have a case diary numbered "${caseDiaryNo}"`);
  }
}

async function assertCaseTypeUsable(caseTypeId: string): Promise<void> {
  const [caseType] = await db
    .select({ id: caseTypes.id, isActive: caseTypes.isActive })
    .from(caseTypes)
    .where(eq(caseTypes.id, caseTypeId))
    .limit(1);

  if (!caseType) throw new ValidationError("Select a valid case type");
  if (!caseType.isActive) throw new ValidationError("This case type is no longer active");
}

async function loadDiaryOrThrow(diaryId: string): Promise<CaseDiaryRow> {
  const [diary] = await db
    .select()
    .from(caseDiaries)
    .where(and(eq(caseDiaries.id, diaryId), isNull(caseDiaries.deletedAt)))
    .limit(1);

  if (!diary) throw new NotFoundError("Case diary not found");
  return diary;
}

async function loadSharedDiaryIds(userId: string): Promise<string[]> {
  const shares = await db
    .select({ diaryId: diaryShares.diaryId })
    .from(diaryShares)
    .where(eq(diaryShares.sharedWithUserId, userId));
  return shares.map((row) => row.diaryId);
}

/**
 * "Browse scope" — the set of diaries reachable through listing, search, and
 * similar-case surfaces: the caller's own, every `PUBLIC` diary, and anything
 * explicitly shared with them. Deliberately excludes admin-approved `PRIVATE`
 * access (§5.2 says that grant is "not a standing admin override" — it is an
 * exceptional, audit-logged path reached only via the approval record's direct
 * diary id through `assertCanView`, never by browsing/searching). Reused by
 * `listCaseDiaries` and the `search` module so the rule lives in exactly one
 * place.
 */
export async function buildBrowseScopeCondition(user: AuthenticatedUser) {
  const sharedDiaryIds = await loadSharedDiaryIds(user.id);
  return sharedDiaryIds.length > 0
    ? or(
        eq(caseDiaries.ownerId, user.id),
        eq(caseDiaries.visibility, "PUBLIC"),
        inArray(caseDiaries.id, sharedDiaryIds),
      )
    : or(eq(caseDiaries.ownerId, user.id), eq(caseDiaries.visibility, "PUBLIC"));
}

async function hasShareGrant(diaryId: string, userId: string): Promise<boolean> {
  const [share] = await db
    .select({ id: diaryShares.id })
    .from(diaryShares)
    .where(and(eq(diaryShares.diaryId, diaryId), eq(diaryShares.sharedWithUserId, userId)))
    .limit(1);
  return Boolean(share);
}

async function hasApprovedPrivateAccess(diaryId: string, adminId: string): Promise<boolean> {
  const [approval] = await db
    .select({ id: privateAccessApprovals.id })
    .from(privateAccessApprovals)
    .where(
      and(
        eq(privateAccessApprovals.diaryId, diaryId),
        eq(privateAccessApprovals.requestingAdminId, adminId),
        eq(privateAccessApprovals.status, "approved"),
        gt(privateAccessApprovals.grantedUntil, new Date()),
      ),
    )
    .limit(1);
  return Boolean(approval);
}

/**
 * Defense-in-depth visibility check (§5.2): owner always; `PUBLIC` to any
 * authenticated user; `PRIVATE` only via an explicit `DiaryShare` grant, or —
 * for admins — a live, ADG-Technical-approved `PrivateAccessApproval` window.
 * There is no standing admin override.
 */
async function assertCanView(user: AuthenticatedUser, diary: CaseDiaryRow): Promise<void> {
  if (diary.ownerId === user.id) return;
  if (diary.visibility === "PUBLIC") return;
  if (await hasShareGrant(diary.id, user.id)) return;
  if (user.role === "ADMIN" && (await hasApprovedPrivateAccess(diary.id, user.id))) return;

  throw new ForbiddenError("You do not have access to this case diary");
}

async function recordRevisionSnapshot(diary: CaseDiaryRow): Promise<void> {
  await db.insert(caseDiaryRevisions).values({
    id: generateId("rev"),
    diaryId: diary.id,
    snapshot: diary,
  });
}

// ── Create ─────────────────────────────────────────────────────────────────

export async function createCaseDiary(
  user: AuthenticatedUser,
  input: CreateCaseDiaryInput,
  context: RequestContext,
): Promise<CaseDiaryRow> {
  await assertCaseTypeUsable(input.caseTypeId);
  const caseDiaryNo = await generateNextCaseDiaryNo(user.id);

  const [diary] = await db
    .insert(caseDiaries)
    .values({
      id: generateId("diary"),
      ownerId: user.id,
      caseTypeId: input.caseTypeId,
      caseDiaryNo,
      firNo: input.firNo,
      underSection: input.underSection,
      policeStation: input.policeStation,
      incidentDateTime: input.incidentDateTime,
      firRegistrationDateTime: input.firRegistrationDateTime,
      placeOfIncidence: input.placeOfIncidence,
      plaintiffName: input.plaintiffName,
      accusedName: input.accusedName,
      body: input.body ?? {},
      visibility: "PRIVATE",
      status: "draft",
    })
    .returning();

  if (!diary) throw new ValidationError("Could not create the case diary. Please try again.");

  await recordRevisionSnapshot(diary);
  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.created",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { caseDiaryNo: diary.caseDiaryNo },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return diary;
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function listCaseDiaries(
  user: AuthenticatedUser,
  query: ListCaseDiariesQuery,
): Promise<CaseDiaryRow[]> {
  let scopeCondition;
  switch (query.scope) {
    case "mine":
      scopeCondition = eq(caseDiaries.ownerId, user.id);
      break;
    case "public":
      scopeCondition = eq(caseDiaries.visibility, "PUBLIC");
      break;
    case "shared": {
      const sharedDiaryIds = await loadSharedDiaryIds(user.id);
      if (sharedDiaryIds.length === 0) return [];
      scopeCondition = inArray(caseDiaries.id, sharedDiaryIds);
      break;
    }
    case "all":
    default:
      scopeCondition = await buildBrowseScopeCondition(user);
  }

  const conditions = [isNull(caseDiaries.deletedAt), scopeCondition];
  if (query.firNo) conditions.push(ilike(caseDiaries.firNo, `%${query.firNo}%`));

  return db
    .select()
    .from(caseDiaries)
    .where(and(...conditions))
    .orderBy(desc(caseDiaries.updatedAt))
    .limit(200);
}

export async function getCaseDiaryById(
  user: AuthenticatedUser,
  diaryId: string,
  context: RequestContext,
): Promise<CaseDiaryRow> {
  const diary = await loadDiaryOrThrow(diaryId);
  await assertCanView(user, diary);

  // Logging the owner's own routine reads would drown the audit trail in noise;
  // what §6.4 cares about is *other people* reaching this diary (collaboration
  // and exceptional-access events), so only those are recorded.
  if (diary.ownerId !== user.id) {
    await recordAuditEntry({
      actorId: user.id,
      action: "case_diary.viewed",
      resourceType: "case_diary",
      resourceId: diary.id,
      metadata: { ownerId: diary.ownerId, visibility: diary.visibility },
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  return diary;
}

export async function listCaseDiaryRevisions(user: AuthenticatedUser, diaryId: string) {
  const diary = await loadDiaryOrThrow(diaryId);

  if (diary.ownerId !== user.id) {
    if (user.role !== "ADMIN") {
      throw new ForbiddenError("Only the owning officer or an admin can view revision history");
    }
    // An admin's reach into a PRIVATE diary's history is gated identically to
    // viewing the diary itself — otherwise revisions would be a back door
    // around the ADG-Technical approval requirement (§5.2).
    await assertCanView(user, diary);
  }

  return db
    .select()
    .from(caseDiaryRevisions)
    .where(eq(caseDiaryRevisions.diaryId, diary.id))
    .orderBy(desc(caseDiaryRevisions.createdAt));
}

// ── Update / Delete ────────────────────────────────────────────────────────

export async function updateCaseDiary(
  user: AuthenticatedUser,
  diaryId: string,
  input: UpdateCaseDiaryInput,
  context: RequestContext,
): Promise<CaseDiaryRow> {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) {
    // Admins manage taxonomy/governance only — never another officer's content (§5.2).
    throw new ForbiddenError("Only the owning officer can edit this case diary");
  }

  if (input.caseTypeId !== undefined) await assertCaseTypeUsable(input.caseTypeId);

  const nextCaseDiaryNo = input.caseDiaryNo?.trim();
  if (nextCaseDiaryNo && nextCaseDiaryNo !== diary.caseDiaryNo) {
    await assertCaseDiaryNoAvailable(user.id, nextCaseDiaryNo, diary.id);
  }

  const updates: Partial<typeof caseDiaries.$inferInsert> = { updatedAt: new Date() };
  if (nextCaseDiaryNo) updates.caseDiaryNo = nextCaseDiaryNo;
  if (input.caseTypeId !== undefined) updates.caseTypeId = input.caseTypeId;
  if (input.firNo !== undefined) updates.firNo = input.firNo;
  if (input.underSection !== undefined) updates.underSection = input.underSection;
  if (input.policeStation !== undefined) updates.policeStation = input.policeStation;
  if (input.incidentDateTime !== undefined) updates.incidentDateTime = input.incidentDateTime;
  if (input.firRegistrationDateTime !== undefined) updates.firRegistrationDateTime = input.firRegistrationDateTime;
  if (input.placeOfIncidence !== undefined) updates.placeOfIncidence = input.placeOfIncidence;
  if (input.plaintiffName !== undefined) updates.plaintiffName = input.plaintiffName;
  if (input.accusedName !== undefined) updates.accusedName = input.accusedName;
  if (input.body !== undefined) updates.body = input.body;
  if (input.status !== undefined) updates.status = input.status;

  const [updated] = await db
    .update(caseDiaries)
    .set(updates)
    .where(eq(caseDiaries.id, diary.id))
    .returning();
  if (!updated) throw new NotFoundError("Case diary not found");

  // Versioning (§6.2): every explicit save persists an immutable snapshot so the
  // officer can review "what changed" before final CCTNS submission.
  await recordRevisionSnapshot(updated);
  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.updated",
    resourceType: "case_diary",
    resourceId: updated.id,
    metadata: { fields: Object.keys(updates).filter((key) => key !== "updatedAt") },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return updated;
}

export async function deleteCaseDiary(
  user: AuthenticatedUser,
  diaryId: string,
  context: RequestContext,
): Promise<void> {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) {
    throw new ForbiddenError("Only the owning officer can delete this case diary");
  }

  await db
    .update(caseDiaries)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(caseDiaries.id, diary.id));

  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.deleted",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { caseDiaryNo: diary.caseDiaryNo },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

// ── Visibility step-up (PRIVATE → PUBLIC only; narrowing applies via update) ─

function ownerIdentifier(user: AuthenticatedUser): string {
  const identifier = user.mobile ?? user.email;
  if (!identifier) {
    throw new ValidationError("Add a verified email or mobile number before changing visibility");
  }
  return identifier;
}

export async function requestVisibilityChangeOtp(
  user: AuthenticatedUser,
  diaryId: string,
  _input: VisibilityRequestOtpInput,
  context: RequestContext,
): Promise<void> {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) throw new ForbiddenError("Only the owning officer can change visibility");
  if (diary.visibility === "PUBLIC") throw new ConflictError("This case diary is already public");

  await issueOtpChallenge(ownerIdentifier(user), "visibility-change");
  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.visibility_otp_requested",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { from: diary.visibility, to: "PUBLIC" },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export async function confirmVisibilityChange(
  user: AuthenticatedUser,
  diaryId: string,
  input: VisibilityConfirmInput,
  context: RequestContext,
): Promise<CaseDiaryRow> {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) throw new ForbiddenError("Only the owning officer can change visibility");
  if (diary.visibility === "PUBLIC") throw new ConflictError("This case diary is already public");

  await consumeOtpChallenge(ownerIdentifier(user), "visibility-change", input.code, GENERIC_OTP_FAILURE);

  const [updated] = await db
    .update(caseDiaries)
    .set({ visibility: "PUBLIC", updatedAt: new Date() })
    .where(eq(caseDiaries.id, diary.id))
    .returning();
  if (!updated) throw new NotFoundError("Case diary not found");

  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.visibility_changed",
    resourceType: "case_diary",
    resourceId: updated.id,
    metadata: { from: "PRIVATE", to: "PUBLIC" },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return updated;
}

// ── Sharing (OTP-gated collaboration grants) ──────────────────────────────

async function loadShareRecipientOrThrow(recipientId: string, ownerId: string) {
  const [recipient] = await db.select().from(users).where(eq(users.id, recipientId)).limit(1);
  if (!recipient) throw new ValidationError("Select a valid recipient officer");
  if (recipient.id === ownerId) throw new ValidationError("You cannot share a case diary with yourself");
  if (recipient.accountStatus !== "ACTIVE") {
    throw new ValidationError("This officer's account is not active");
  }
  return recipient;
}

export async function requestShareOtp(
  user: AuthenticatedUser,
  diaryId: string,
  input: ShareRequestOtpInput,
  context: RequestContext,
): Promise<void> {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) throw new ForbiddenError("Only the owning officer can share this case diary");

  const recipient = await loadShareRecipientOrThrow(input.recipientId, user.id);

  if (await hasShareGrant(diary.id, recipient.id)) {
    throw new ConflictError("This case diary is already shared with that officer");
  }

  await issueOtpChallenge(ownerIdentifier(user), "share-confirmation");
  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.share_otp_requested",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { recipientId: recipient.id },
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

export async function confirmShare(
  user: AuthenticatedUser,
  diaryId: string,
  input: ShareConfirmInput,
  context: RequestContext,
) {
  const diary = await loadDiaryOrThrow(diaryId);
  if (diary.ownerId !== user.id) throw new ForbiddenError("Only the owning officer can share this case diary");

  const recipient = await loadShareRecipientOrThrow(input.recipientId, user.id);
  if (await hasShareGrant(diary.id, recipient.id)) {
    throw new ConflictError("This case diary is already shared with that officer");
  }

  const identifier = ownerIdentifier(user);
  const consumed = await consumeOtpChallenge(identifier, "share-confirmation", input.code, GENERIC_OTP_FAILURE);

  const [share] = await db
    .insert(diaryShares)
    .values({
      id: generateId("share"),
      diaryId: diary.id,
      sharedByUserId: user.id,
      sharedWithUserId: recipient.id,
      accessLevel: "READ_ONLY",
      // Ties the grant back to the exact step-up challenge that authorized it —
      // both for the FK and for a precise audit trail.
      otpChallengeId: consumed.id,
    })
    .returning();
  if (!share) throw new ValidationError("Could not create the share grant. Please try again.");

  await recordAuditEntry({
    actorId: user.id,
    action: "case_diary.shared",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { recipientId: recipient.id, accessLevel: share.accessLevel },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return share;
}
