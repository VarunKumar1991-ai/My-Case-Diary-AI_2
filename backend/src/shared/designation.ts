import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { designations } from "../db/schema.js";
import { ValidationError } from "./errors.js";

/**
 * `designation` is an admin-configurable enum (§6.1): officers must pick from the
 * admin-curated list at signup and when editing their profile. We validate the
 * supplied name against the active taxonomy here so both `auth` and `user`
 * modules share one rule — see architecture.md Design Decision D10.
 */
export async function assertDesignationUsable(name: string): Promise<void> {
  const [designation] = await db
    .select({ isActive: designations.isActive })
    .from(designations)
    .where(eq(designations.name, name))
    .limit(1);

  if (!designation) throw new ValidationError("Select a valid designation");
  if (!designation.isActive) throw new ValidationError("This designation is no longer active");
}
