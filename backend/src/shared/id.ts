import { randomUUID } from "node:crypto";

/** Prefixed, sortable-enough opaque IDs — keeps audit logs and URLs human-scannable. */
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
