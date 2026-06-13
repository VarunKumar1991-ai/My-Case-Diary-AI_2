import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { assertDesignationUsable } from "../../shared/designation.js";
import { NotFoundError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import { recordAuditEntry } from "../audit/service.js";
import type { UpdateProfileInput } from "./dto.js";

/**
 * The User row's public projection — strips nothing secret today (there are no
 * passwords or token hashes on this entity) but gives every module a single,
 * stable shape to hand back to clients instead of leaking the raw DB row.
 */
export interface PublicUser {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  role: "OFFICER" | "ADMIN";
  accountStatus: "ACTIVE" | "BLOCKED";
}

export function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: user.name,
    designation: user.designation,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    accountStatus: user.accountStatus,
  };
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError("User not found");
  return toPublicUser(user);
}

/**
 * Self-service profile editing is intentionally narrow: `pno` (identity), `role`,
 * and `accountStatus` are governance-controlled, and `email`/`mobile` changes
 * would require re-verification via OTP (out of scope for this phase — see
 * architecture.md Design Decision D8). Only the free-text `name`/`designation`
 * fields are mutable by the officer themselves. `designation` must still come
 * from the admin-curated taxonomy (§6.1, D10), so we re-validate it here too.
 */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput,
  context: RequestContext,
): Promise<PublicUser> {
  const updates: Partial<{ name: string; designation: string }> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.designation !== undefined) {
    const designation = input.designation.trim();
    await assertDesignationUsable(designation);
    updates.designation = designation;
  }

  const [user] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
  if (!user) throw new NotFoundError("User not found");

  await recordAuditEntry({
    actorId: userId,
    action: "user.profile_updated",
    resourceType: "user",
    resourceId: userId,
    metadata: updates,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return toPublicUser(user);
}
