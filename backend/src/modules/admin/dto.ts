import { z } from "zod";

// ── Taxonomy (Case Type / Designation share an identical shape) ───────────

const taxonomyCore = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().max(2000).optional(),
};

export const createCaseTypeSchema = z.object(taxonomyCore);
export const updateCaseTypeSchema = z
  .object({ ...taxonomyCore, name: taxonomyCore.name.optional(), isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update" });

export const createDesignationSchema = z.object(taxonomyCore);
export const updateDesignationSchema = z
  .object({ ...taxonomyCore, name: taxonomyCore.name.optional(), isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, { message: "Provide at least one field to update" });

// ── User governance ────────────────────────────────────────────────────────

export const listUsersQuerySchema = z.object({
  role: z.enum(["OFFICER", "ADMIN"]).optional(),
  accountStatus: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export const blockUserSchema = z.object({
  reason: z.string().trim().min(3, "Provide a brief reason for the block").max(500),
});

/** Promote/demote a user between the two existing roles — grants or revokes admin powers. */
export const changeUserRoleSchema = z.object({
  role: z.enum(["OFFICER", "ADMIN"]),
});

// ── Private access approvals (ADG-Technical workflow — §6.4) ──────────────

export const createPrivateAccessRequestSchema = z.object({
  diaryId: z.string().trim().min(1, "Select a case diary"),
  justification: z.string().trim().min(10, "Explain why access is needed").max(1000),
});

export const listPrivateAccessRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "denied"]).optional(),
});

export const approvePrivateAccessRequestSchema = z.object({
  grantedHours: z.coerce.number().int().min(1).max(168).optional(),
});

// ── App settings (admin-tunable knobs) ─────────────────────────────────────

export const updateQuickSearchLimitSchema = z.object({
  limit: z.coerce.number().int().min(0, "Cannot be negative").max(24, "24 at most"),
});
export type UpdateQuickSearchLimitInput = z.infer<typeof updateQuickSearchLimitSchema>;

export type CreateCaseTypeInput = z.infer<typeof createCaseTypeSchema>;
export type UpdateCaseTypeInput = z.infer<typeof updateCaseTypeSchema>;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
export type CreatePrivateAccessRequestInput = z.infer<typeof createPrivateAccessRequestSchema>;
export type ListPrivateAccessRequestsQuery = z.infer<typeof listPrivateAccessRequestsQuerySchema>;
export type ApprovePrivateAccessRequestInput = z.infer<typeof approvePrivateAccessRequestSchema>;
