/**
 * Read-only response shapes for the active-taxonomy lookups (no request body/query
 * to validate — these are unparameterized listing endpoints, see service.ts).
 */
export interface LookupCaseType {
  id: string;
  name: string;
  description: string | null;
}

export interface LookupDesignation {
  id: string;
  name: string;
  description: string | null;
}
