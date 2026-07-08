import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { caseDiaries, caseTypes, designations, privateAccessApprovals, users } from "../../db/schema.js";
import type { AuthenticatedUser } from "../../middleware/authGuard.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { generateId } from "../../shared/id.js";
import type { RequestContext } from "../../shared/http.js";
import { recordAuditEntry } from "../audit/service.js";
import {
  getQuickSearchCaseTypeIds as readQuickSearchCaseTypeIds,
  getQuickSearchLimit as readQuickSearchLimit,
  setQuickSearchCaseTypeIds as writeQuickSearchCaseTypeIds,
  setQuickSearchLimit as writeQuickSearchLimit,
} from "../settings/service.js";
import { toPublicUser, type PublicUser } from "../user/service.js";
import type {
  ApprovePrivateAccessRequestInput,
  BlockUserInput,
  ChangeUserRoleInput,
  CreateCaseTypeInput,
  CreateDesignationInput,
  CreatePrivateAccessRequestInput,
  ListPrivateAccessRequestsQuery,
  ListUsersQuery,
  UpdateCaseTypeInput,
  UpdateDesignationInput,
} from "./dto.js";

/**
 * §6.1 names "ADG (Technical)" as the specific post empowered to decide private-access
 * requests — every other `ADMIN` (e.g. DGP) may *file* a request but not approve it.
 * Now that `designation` is an admin-curated taxonomy (D10), this exact-name check is
 * the natural way to identify the post without inventing a third `role` value.
 */
const ADG_TECHNICAL_DESIGNATION = "ADG (Technical)";

/** Default time-box applied when an ADG-Technical approval omits an explicit duration. */
const DEFAULT_PRIVATE_ACCESS_GRANT_HOURS = 24;

type CaseTypeRow = typeof caseTypes.$inferSelect;
type DesignationRow = typeof designations.$inferSelect;
type PrivateAccessApprovalRow = typeof privateAccessApprovals.$inferSelect;

function requireAdmin(user: AuthenticatedUser): void {
  if (user.role !== "ADMIN") throw new ForbiddenError();
}

function requireAdgTechnical(user: AuthenticatedUser): void {
  if (user.role !== "ADMIN" || user.designation !== ADG_TECHNICAL_DESIGNATION) {
    throw new ForbiddenError("Only ADG (Technical) may decide private-access requests");
  }
}

// ── App settings (admin-tunable knobs) ─────────────────────────────────────

export interface QuickSearchSettings {
  /** How many chips the Home page shows. */
  limit: number;
  /** Ordered case-type ids chosen as chips; [] means "all active case types". */
  caseTypeIds: string[];
}

/** Current Home quick-search settings (count + which case types), admin-only. */
export async function getQuickSearchSettings(admin: AuthenticatedUser): Promise<QuickSearchSettings> {
  requireAdmin(admin);
  const [limit, caseTypeIds] = await Promise.all([readQuickSearchLimit(), readQuickSearchCaseTypeIds()]);
  return { limit, caseTypeIds };
}

export async function setQuickSearchSettings(
  admin: AuthenticatedUser,
  input: QuickSearchSettings,
  context: RequestContext,
): Promise<QuickSearchSettings> {
  requireAdmin(admin);
  await writeQuickSearchLimit(input.limit);
  await writeQuickSearchCaseTypeIds(input.caseTypeIds);
  const saved = await getQuickSearchSettings(admin);
  await recordAuditEntry({
    actorId: admin.id,
    action: "settings.quick_search.update",
    resourceType: "app_setting",
    resourceId: "home_quick_search",
    metadata: { limit: saved.limit, caseTypeIds: saved.caseTypeIds },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return saved;
}

// ── Case Type taxonomy ─────────────────────────────────────────────────────

export async function listCaseTypes(): Promise<CaseTypeRow[]> {
  return db.select().from(caseTypes).orderBy(desc(caseTypes.createdAt));
}

async function assertCaseTypeNameAvailable(name: string, excludeId: string | null): Promise<void> {
  const [existing] = await db.select({ id: caseTypes.id }).from(caseTypes).where(eq(caseTypes.name, name)).limit(1);
  if (existing && existing.id !== excludeId) {
    throw new ConflictError(`A case type named "${name}" already exists`);
  }
}

export async function createCaseType(
  admin: AuthenticatedUser,
  input: CreateCaseTypeInput,
  context: RequestContext,
): Promise<CaseTypeRow> {
  requireAdmin(admin);
  const name = input.name.trim();
  await assertCaseTypeNameAvailable(name, null);

  const [caseType] = await db
    .insert(caseTypes)
    .values({ id: generateId("case_type"), name, description: input.description?.trim() || null })
    .returning();
  if (!caseType) throw new ValidationError("Could not create the case type. Please try again.");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.case_type.created",
    resourceType: "case_type",
    resourceId: caseType.id,
    metadata: { name },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return caseType;
}

export async function updateCaseType(
  admin: AuthenticatedUser,
  caseTypeId: string,
  input: UpdateCaseTypeInput,
  context: RequestContext,
): Promise<CaseTypeRow> {
  requireAdmin(admin);

  const updates: Partial<{ name: string; description: string | null; isActive: boolean }> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    await assertCaseTypeNameAvailable(name, caseTypeId);
    updates.name = name;
  }
  if (input.description !== undefined) updates.description = input.description.trim() || null;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const [caseType] = await db.update(caseTypes).set(updates).where(eq(caseTypes.id, caseTypeId)).returning();
  if (!caseType) throw new NotFoundError("Case type not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.case_type.updated",
    resourceType: "case_type",
    resourceId: caseType.id,
    metadata: updates,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return caseType;
}

/**
 * "Delete" deactivates rather than removes the row (D11): `CaseDiary.caseTypeId`
 * references this table, so a hard delete of an in-use entry would either violate
 * that FK or silently orphan history. `isActive = false` removes it from selection
 * everywhere (`assertCaseTypeUsable`) while existing diaries keep a valid reference.
 */
export async function deactivateCaseType(
  admin: AuthenticatedUser,
  caseTypeId: string,
  context: RequestContext,
): Promise<void> {
  requireAdmin(admin);

  const [caseType] = await db
    .update(caseTypes)
    .set({ isActive: false })
    .where(eq(caseTypes.id, caseTypeId))
    .returning();
  if (!caseType) throw new NotFoundError("Case type not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.case_type.deactivated",
    resourceType: "case_type",
    resourceId: caseType.id,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

// ── Designation taxonomy (mirrors Case Type — D10) ─────────────────────────

export async function listDesignations(): Promise<DesignationRow[]> {
  return db.select().from(designations).orderBy(desc(designations.createdAt));
}

async function assertDesignationNameAvailable(name: string, excludeId: string | null): Promise<void> {
  const [existing] = await db
    .select({ id: designations.id })
    .from(designations)
    .where(eq(designations.name, name))
    .limit(1);
  if (existing && existing.id !== excludeId) {
    throw new ConflictError(`A designation named "${name}" already exists`);
  }
}

export async function createDesignation(
  admin: AuthenticatedUser,
  input: CreateDesignationInput,
  context: RequestContext,
): Promise<DesignationRow> {
  requireAdmin(admin);
  const name = input.name.trim();
  await assertDesignationNameAvailable(name, null);

  const [designation] = await db
    .insert(designations)
    .values({ id: generateId("designation"), name, description: input.description?.trim() || null })
    .returning();
  if (!designation) throw new ValidationError("Could not create the designation. Please try again.");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.designation.created",
    resourceType: "designation",
    resourceId: designation.id,
    metadata: { name },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return designation;
}

export async function updateDesignation(
  admin: AuthenticatedUser,
  designationId: string,
  input: UpdateDesignationInput,
  context: RequestContext,
): Promise<DesignationRow> {
  requireAdmin(admin);

  const updates: Partial<{ name: string; description: string | null; isActive: boolean }> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    await assertDesignationNameAvailable(name, designationId);
    updates.name = name;
  }
  if (input.description !== undefined) updates.description = input.description.trim() || null;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  const [designation] = await db
    .update(designations)
    .set(updates)
    .where(eq(designations.id, designationId))
    .returning();
  if (!designation) throw new NotFoundError("Designation not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.designation.updated",
    resourceType: "designation",
    resourceId: designation.id,
    metadata: updates,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return designation;
}

/** Deactivates rather than deletes — same FK/history rationale as `deactivateCaseType` (D11). */
export async function deactivateDesignation(
  admin: AuthenticatedUser,
  designationId: string,
  context: RequestContext,
): Promise<void> {
  requireAdmin(admin);

  const [designation] = await db
    .update(designations)
    .set({ isActive: false })
    .where(eq(designations.id, designationId))
    .returning();
  if (!designation) throw new NotFoundError("Designation not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.designation.deactivated",
    resourceType: "designation",
    resourceId: designation.id,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });
}

// ── User governance ────────────────────────────────────────────────────────

export async function listUsers(admin: AuthenticatedUser, query: ListUsersQuery): Promise<PublicUser[]> {
  requireAdmin(admin);

  const conditions = [];
  if (query.role) conditions.push(eq(users.role, query.role));
  if (query.accountStatus) conditions.push(eq(users.accountStatus, query.accountStatus));
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.id, pattern)));
  }

  const rows = await db
    .select()
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(500);

  return rows.map(toPublicUser);
}

/**
 * "Invalidating active sessions" on block is achieved without a token blocklist:
 * `authGuard` re-loads the user from the DB on every request and rejects
 * `accountStatus = 'BLOCKED'` immediately (see authGuard.ts). Because access
 * tokens are short-lived and every request re-checks the DB, a block takes
 * effect on the very next request — there is no separate store to clear.
 */
export async function blockUser(
  admin: AuthenticatedUser,
  targetUserId: string,
  input: BlockUserInput,
  context: RequestContext,
): Promise<PublicUser> {
  requireAdmin(admin);
  if (targetUserId === admin.id) {
    throw new ValidationError("You cannot block your own account");
  }

  const [user] = await db
    .update(users)
    .set({ accountStatus: "BLOCKED" })
    .where(eq(users.id, targetUserId))
    .returning();
  if (!user) throw new NotFoundError("User not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.user.blocked",
    resourceType: "user",
    resourceId: user.id,
    metadata: { reason: input.reason.trim() },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return toPublicUser(user);
}

export async function unblockUser(
  admin: AuthenticatedUser,
  targetUserId: string,
  context: RequestContext,
): Promise<PublicUser> {
  requireAdmin(admin);

  const [user] = await db
    .update(users)
    .set({ accountStatus: "ACTIVE" })
    .where(eq(users.id, targetUserId))
    .returning();
  if (!user) throw new NotFoundError("User not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.user.unblocked",
    resourceType: "user",
    resourceId: user.id,
    metadata: {},
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return toPublicUser(user);
}

/**
 * Grant or revoke admin powers by switching a user between the two existing
 * `role` enum values ("OFFICER" ⇄ "ADMIN") — no schema change, the column has
 * always allowed both. Mirrors block/unblock: ADMIN-gated, self-targeting is
 * refused (so an admin can't accidentally strip their own access and lock the
 * console), and the change is written to the append-only audit trail. Like a
 * block, it takes effect on the target's next request because `authGuard`
 * re-loads the user (and thus their role) from the DB every time.
 */
export async function changeUserRole(
  admin: AuthenticatedUser,
  targetUserId: string,
  input: ChangeUserRoleInput,
  context: RequestContext,
): Promise<PublicUser> {
  requireAdmin(admin);
  if (targetUserId === admin.id) {
    throw new ValidationError("You cannot change your own role");
  }

  const [user] = await db
    .update(users)
    .set({ role: input.role })
    .where(eq(users.id, targetUserId))
    .returning();
  if (!user) throw new NotFoundError("User not found");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.user.role_changed",
    resourceType: "user",
    resourceId: user.id,
    metadata: { role: input.role },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return toPublicUser(user);
}

// ── Private Access Approvals (ADG-Technical workflow — §5.2/§6.4) ─────────

export async function listPrivateAccessRequests(
  admin: AuthenticatedUser,
  query: ListPrivateAccessRequestsQuery,
): Promise<PrivateAccessApprovalRow[]> {
  requireAdmin(admin);

  const isAdg = admin.designation === ADG_TECHNICAL_DESIGNATION;
  const conditions = [];
  if (!isAdg) conditions.push(eq(privateAccessApprovals.requestingAdminId, admin.id));
  if (query.status) conditions.push(eq(privateAccessApprovals.status, query.status));

  return db
    .select()
    .from(privateAccessApprovals)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(privateAccessApprovals.createdAt))
    .limit(200);
}

export async function requestPrivateAccess(
  admin: AuthenticatedUser,
  input: CreatePrivateAccessRequestInput,
  context: RequestContext,
): Promise<PrivateAccessApprovalRow> {
  requireAdmin(admin);

  const [diary] = await db
    .select({ id: caseDiaries.id, visibility: caseDiaries.visibility })
    .from(caseDiaries)
    .where(eq(caseDiaries.id, input.diaryId))
    .limit(1);
  if (!diary) throw new NotFoundError("Case diary not found");
  if (diary.visibility !== "PRIVATE") {
    throw new ValidationError("Only private case diaries require an access approval");
  }

  const [pending] = await db
    .select({ id: privateAccessApprovals.id })
    .from(privateAccessApprovals)
    .where(
      and(
        eq(privateAccessApprovals.diaryId, diary.id),
        eq(privateAccessApprovals.requestingAdminId, admin.id),
        eq(privateAccessApprovals.status, "pending"),
      ),
    )
    .limit(1);
  if (pending) throw new ConflictError("You already have a pending request for this case diary");

  const [request] = await db
    .insert(privateAccessApprovals)
    .values({
      id: generateId("private_access"),
      diaryId: diary.id,
      requestingAdminId: admin.id,
      justification: input.justification.trim(),
      status: "pending",
    })
    .returning();
  if (!request) throw new ValidationError("Could not submit the request. Please try again.");

  await recordAuditEntry({
    actorId: admin.id,
    action: "admin.private_access.requested",
    resourceType: "case_diary",
    resourceId: diary.id,
    metadata: { requestId: request.id },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return request;
}

async function loadPendingRequestOrThrow(requestId: string): Promise<PrivateAccessApprovalRow> {
  const [request] = await db
    .select()
    .from(privateAccessApprovals)
    .where(eq(privateAccessApprovals.id, requestId))
    .limit(1);
  if (!request) throw new NotFoundError("Private access request not found");
  if (request.status !== "pending") throw new ConflictError("This request has already been decided");
  return request;
}

async function recordPrivateAccessDecision(
  adg: AuthenticatedUser,
  requestId: string,
  status: "approved" | "denied",
  grantedUntil: Date | null,
  context: RequestContext,
): Promise<PrivateAccessApprovalRow> {
  const [decided] = await db
    .update(privateAccessApprovals)
    .set({ status, approvingAdgId: adg.id, grantedUntil })
    .where(eq(privateAccessApprovals.id, requestId))
    .returning();
  if (!decided) throw new NotFoundError("Private access request not found");

  await recordAuditEntry({
    actorId: adg.id,
    action: status === "approved" ? "admin.private_access.approved" : "admin.private_access.denied",
    resourceType: "case_diary",
    resourceId: decided.diaryId,
    metadata: { requestId: decided.id, grantedUntil: grantedUntil?.toISOString() ?? null },
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return decided;
}

export async function approvePrivateAccessRequest(
  adg: AuthenticatedUser,
  requestId: string,
  input: ApprovePrivateAccessRequestInput,
  context: RequestContext,
): Promise<PrivateAccessApprovalRow> {
  requireAdgTechnical(adg);
  await loadPendingRequestOrThrow(requestId);

  const grantedUntil = new Date(
    Date.now() + (input.grantedHours ?? DEFAULT_PRIVATE_ACCESS_GRANT_HOURS) * 60 * 60 * 1000,
  );
  return recordPrivateAccessDecision(adg, requestId, "approved", grantedUntil, context);
}

export async function denyPrivateAccessRequest(
  adg: AuthenticatedUser,
  requestId: string,
  context: RequestContext,
): Promise<PrivateAccessApprovalRow> {
  requireAdgTechnical(adg);
  await loadPendingRequestOrThrow(requestId);

  return recordPrivateAccessDecision(adg, requestId, "denied", null, context);
}
