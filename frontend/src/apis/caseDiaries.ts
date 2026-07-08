/**
 * Typed client for `/case-diaries/*` (architecture.md §10.1). Response shapes
 * mirror the raw `caseDiaries` row the backend returns (`backend/src/db/schema.ts`
 * — controllers send `CaseDiaryRow` directly, no joined `caseType.name`; resolve
 * names client-side via `lookupsApi.listCaseTypes()`).
 */
import { api } from "@/apis/client";

export type DiaryVisibility = "PRIVATE" | "PUBLIC";
export type DiaryStatus = "draft" | "finalized";

export interface CaseDiary {
  id: string;
  ownerId: string;
  caseTypeId: string;
  caseDiaryNo: string;
  caseDiaryDate: string | null;
  firNo: string;
  underSection: string;
  policeStation: string;
  incidentDateTime: string;
  firRegistrationDateTime: string;
  placeOfIncidence: string;
  plaintiffName: string;
  accusedName: string;
  body: Record<string, unknown>;
  visibility: DiaryVisibility;
  status: DiaryStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CaseDiaryListScope = "mine" | "shared" | "public" | "all";

/** Mirrors `createCaseDiarySchema` (backend `case-diary/dto.ts`) — every field but `body` is required to create. */
export interface CaseDiaryHeaderInput {
  caseTypeId: string;
  firNo: string;
  underSection: string;
  policeStation: string;
  /** ISO 8601 — `zod`'s `z.coerce.date()` accepts the string form directly. */
  incidentDateTime: string;
  firRegistrationDateTime: string;
  placeOfIncidence: string;
  plaintiffName: string;
  accusedName: string;
}

export interface CreateCaseDiaryInput extends CaseDiaryHeaderInput {
  caseDiaryNo?: string;
  caseDiaryDate?: string;
  body?: Record<string, unknown>;
  /** Defaults to PUBLIC server-side; PRIVATE needs no OTP at creation (it's a narrowing). */
  visibility?: DiaryVisibility;
}

/** Mirrors `updateCaseDiarySchema` — every field optional; PATCH-like partial `PUT`. */
export type UpdateCaseDiaryInput = Partial<CaseDiaryHeaderInput> & {
  caseDiaryNo?: string;
  status?: DiaryStatus;
  body?: Record<string, unknown>;
};

export const caseDiariesApi = {
  // CD No. is scoped per FIR — pass the FIR being drafted so the sequence starts
  // at CD-001 for a new investigation and increments within an existing one.
  nextNo: (firNo?: string) =>
    api.get<{ caseDiaryNo: string }>("/case-diaries/next-no", firNo ? { firNo } : undefined),

  search: (q: string) => api.get<{ caseDiaries: CaseDiary[] }>("/case-diaries/search", { q }),

  list: (params?: { firNo?: string; scope?: CaseDiaryListScope }) =>
    api.get<{ caseDiaries: CaseDiary[] }>("/case-diaries", params),

  similar: (id: string) => api.get<{ caseDiaries: CaseDiary[] }>(`/case-diaries/${id}/similar`),

  get: (id: string) => api.get<{ caseDiary: CaseDiary }>(`/case-diaries/${id}`),

  create: (input: CreateCaseDiaryInput) => api.post<{ caseDiary: CaseDiary }>("/case-diaries", input),

  update: (id: string, input: UpdateCaseDiaryInput) =>
    api.put<{ caseDiary: CaseDiary }>(`/case-diaries/${id}`, input),

  remove: (id: string) => api.delete<void>(`/case-diaries/${id}`),

  /** Sends a 6-digit OTP to the owner's own email/mobile — the step-up required before switching an FIR's visibility (PRIVATE ⇄ PUBLIC). */
  requestVisibilityOtp: (id: string, visibility: DiaryVisibility) =>
    api.post<{ message: string }>(`/case-diaries/${id}/visibility/request-otp`, { visibility }),

  confirmVisibility: (id: string, visibility: DiaryVisibility, code: string) =>
    api.post<{ caseDiary: CaseDiary }>(`/case-diaries/${id}/visibility/confirm`, { visibility, code }),

  /** Sends a 6-digit OTP to the owner before granting a colleague read-only access to this diary. */
  requestShareOtp: (id: string, recipientId: string) =>
    api.post<{ message: string }>(`/case-diaries/${id}/share/request-otp`, { recipientId }),

  confirmShare: (id: string, recipientId: string, code: string) =>
    api.post<{ share: unknown }>(`/case-diaries/${id}/share/confirm`, { recipientId, code }),

  /** FIR-wide share log: which CD went to which officer and when (owner-only). */
  getShareLog: (id: string) => api.get<ShareLog>(`/case-diaries/${id}/share-log`),

  /** Phase-1 AI: a Hindi summary of this मुकदमा's readable case diaries. */
  aiSummary: (id: string) => api.post<CaseDiarySummary>(`/case-diaries/${id}/ai-summary`),
};

export interface CaseDiarySummary {
  firNo: string;
  provider: string;
  model: string;
  diaryCount: number;
  summary: string;
}

export interface ShareLogEntry {
  diaryId: string;
  caseDiaryNo: string;
  recipientId: string;
  recipientName: string;
  recipientDesignation: string | null;
  sharedAt: string;
}

export interface ShareLog {
  firNo: string;
  recipientCount: number;
  sharedDiaryCount: number;
  entries: ShareLogEntry[];
}
