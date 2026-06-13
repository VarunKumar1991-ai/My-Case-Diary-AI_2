import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditLogs } from "../../db/schema.js";
import { generateId } from "../../shared/id.js";

export interface RecordAuditEntryInput {
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only by convention: this module deliberately exposes no update/delete
 * paths, so tampering with history would require direct DB access (outside the
 * application's trust boundary) — see architecture.md §5.
 */
export async function recordAuditEntry(input: RecordAuditEntryInput): Promise<void> {
  await db.insert(auditLogs).values({
    id: generateId("audit"),
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function listAuditLogs(limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function listAuditLogsForResource(resourceType: string, resourceId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.resourceType, resourceType))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200)
    .then((rows) => rows.filter((row) => row.resourceId === resourceId));
}
