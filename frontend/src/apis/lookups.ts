/**
 * Typed client for the read-only `lookups` resource (active-only, name-ordered
 * taxonomy projections — see `backend/src/modules/lookups`). `designations` is
 * reachable signed-out (sign-up has no session yet); `caseTypes` requires a
 * session but no particular role. Neither is the ADMIN-gated management list.
 */
import { api } from "@/apis/client";

export interface LookupOption {
  id: string;
  name: string;
  description: string | null;
}

export const lookupsApi = {
  listDesignations: () => api.get<{ designations: LookupOption[] }>("/designations"),
  listCaseTypes: () => api.get<{ caseTypes: LookupOption[] }>("/case-types"),
};
