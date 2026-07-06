import { and, asc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { caseTypes, designations, users } from "../../db/schema.js";
import type { LookupCaseType, LookupDesignation, LookupOfficer } from "./dto.js";

/**
 * §6.1/§6.2 require officers to *pick from* the admin-curated case-type and
 * designation taxonomies (at signup, profile editing, and diary creation) —
 * but `/admin/case-types` and `/admin/designations` (which return the full,
 * inactive-included list for management) are intentionally `requireRole("ADMIN")`
 * (D11). These read-only, active-only projections are what those pickers use;
 * `designations` must additionally be reachable *unauthenticated* (signup has
 * no session yet), so this module is mounted outside both `authGuard` and the
 * admin RBAC chain — see routes.ts for the per-route auth split.
 */

export async function listActiveCaseTypes(): Promise<LookupCaseType[]> {
  return db
    .select({ id: caseTypes.id, name: caseTypes.name, description: caseTypes.description })
    .from(caseTypes)
    .where(eq(caseTypes.isActive, true))
    .orderBy(asc(caseTypes.name));
}

export async function listActiveDesignations(): Promise<LookupDesignation[]> {
  return db
    .select({ id: designations.id, name: designations.name, description: designations.description })
    .from(designations)
    .where(eq(designations.isActive, true))
    .orderBy(asc(designations.name));
}

/**
 * Directory of ACTIVE officers for the diary-share recipient picker. Any signed-in
 * officer may look colleagues up (by name or PNO) to share a case diary with them;
 * only the minimal id/name/designation is exposed (never contact details), the
 * caller is excluded, and results are capped so this can back a type-ahead.
 */
export async function searchOfficers(query: string | undefined, excludeUserId: string): Promise<LookupOfficer[]> {
  const conditions = [eq(users.accountStatus, "ACTIVE"), ne(users.id, excludeUserId)];
  if (query) {
    const pattern = `%${query}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.id, pattern))!);
  }
  return db
    .select({ id: users.id, name: users.name, designation: users.designation })
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(users.name))
    .limit(20);
}
