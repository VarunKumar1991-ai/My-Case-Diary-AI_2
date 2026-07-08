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

export interface LookupOfficer {
  id: string;
  name: string;
  designation: string | null;
}

export const lookupsApi = {
  listDesignations: () => api.get<{ designations: LookupOption[] }>("/designations"),
  listCaseTypes: () => api.get<{ caseTypes: LookupOption[] }>("/case-types"),
  /** How many quick-search chips the Home page should render (admin-tuned). */
  getQuickSearchConfig: () => api.get<{ limit: number }>("/quick-search"),
  /** Active officers matching `q` (by name or PNO), for the diary-share recipient picker. */
  searchOfficers: (q: string) => api.get<{ officers: LookupOfficer[] }>("/officers", { q: q || undefined }),
};
