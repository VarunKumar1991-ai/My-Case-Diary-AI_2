/**
 * Typed client for the ADMIN-gated `/admin/*` surface — taxonomy CRUD, user
 * governance, the private-access approval workflow (§6.4), and the append-only
 * audit log (mounted alongside `adminRouter` at the same `/admin` prefix —
 * see `backend/src/app.ts`). Mirrors `backend/src/modules/admin/{routes,dto}.ts`.
 */
import { api } from "@/apis/client";
import type { AccountStatus, Role } from "@/context/AuthContext";

export interface TaxonomyItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateTaxonomyInput {
  name: string;
  description?: string;
}

export interface UpdateTaxonomyInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  role: Role;
  accountStatus: AccountStatus;
}

export interface ListUsersParams {
  role?: Role;
  accountStatus?: AccountStatus;
  q?: string;
}

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface PrivateAccessRequest {
  id: string;
  diaryId: string;
  requestingAdminId: string;
  approvingAdgId: string | null;
  justification: string;
  status: ApprovalStatus;
  grantedUntil: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const adminApi = {
  listCaseTypes: () => api.get<{ caseTypes: TaxonomyItem[] }>("/admin/case-types"),
  createCaseType: (input: CreateTaxonomyInput) => api.post<{ caseType: TaxonomyItem }>("/admin/case-types", input),
  updateCaseType: (id: string, input: UpdateTaxonomyInput) =>
    api.put<{ caseType: TaxonomyItem }>(`/admin/case-types/${id}`, input),
  deactivateCaseType: (id: string) => api.delete<void>(`/admin/case-types/${id}`),

  listDesignations: () => api.get<{ designations: TaxonomyItem[] }>("/admin/designations"),
  createDesignation: (input: CreateTaxonomyInput) =>
    api.post<{ designation: TaxonomyItem }>("/admin/designations", input),
  updateDesignation: (id: string, input: UpdateTaxonomyInput) =>
    api.put<{ designation: TaxonomyItem }>(`/admin/designations/${id}`, input),
  deactivateDesignation: (id: string) => api.delete<void>(`/admin/designations/${id}`),

  listUsers: (params: ListUsersParams) =>
    api.get<{ users: AdminUser[] }>("/admin/users", { role: params.role, accountStatus: params.accountStatus, q: params.q || undefined }),
  blockUser: (id: string, reason: string) => api.post<{ user: AdminUser }>(`/admin/users/${id}/block`, { reason }),
  unblockUser: (id: string) => api.post<{ user: AdminUser }>(`/admin/users/${id}/unblock`),

  listPrivateAccessRequests: (status?: ApprovalStatus) =>
    api.get<{ requests: PrivateAccessRequest[] }>("/admin/private-access-requests", { status }),
  requestPrivateAccess: (diaryId: string, justification: string) =>
    api.post<{ request: PrivateAccessRequest }>("/admin/private-access-requests", { diaryId, justification }),
  approvePrivateAccessRequest: (id: string, grantedHours?: number) =>
    api.post<{ request: PrivateAccessRequest }>(`/admin/private-access-requests/${id}/approve`, { grantedHours }),
  denyPrivateAccessRequest: (id: string) =>
    api.post<{ request: PrivateAccessRequest }>(`/admin/private-access-requests/${id}/deny`),

  listAuditLogs: (limit?: number) => api.get<{ logs: AuditLogEntry[] }>("/admin/audit-logs", { limit }),
};
