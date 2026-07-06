import { z } from "zod";

/** Rich-text editor document (Tiptap/ProseMirror JSON) — validated as a plain object; the editor owns the internal shape. */
const bodySchema = z.record(z.string(), z.unknown());

const diaryCore = {
  caseTypeId: z.string().trim().min(1, "Select a case type"),
  firNo: z.string().trim().min(1, "FIR number is required").max(64),
  underSection: z.string().trim().min(1, "Section is required").max(500),
  policeStation: z.string().trim().min(1, "Police station is required").max(200),
  incidentDateTime: z.coerce.date(),
  firRegistrationDateTime: z.coerce.date(),
  placeOfIncidence: z.string().trim().min(1, "Place of incidence is required").max(500),
  plaintiffName: z.string().trim().min(1, "Plaintiff name is required").max(200),
  accusedName: z.string().trim().min(1, "Accused name is required").max(10000),
};

const diaryCoreSchema = z.object(diaryCore);

export const createCaseDiarySchema = diaryCoreSchema.extend({
  caseDiaryNo: z.string().trim().min(1).max(32).optional(),
  caseDiaryDate: z.coerce.date().optional(),
  body: bodySchema.optional(),
  // Officer picks visibility when starting the investigation. PRIVATE is a
  // narrowing (no OTP — mirrors the step-up model, where only PRIVATE→PUBLIC is gated).
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
});

export const updateCaseDiarySchema = diaryCoreSchema
  .partial()
  .extend({
    caseDiaryNo: z.string().trim().min(1).max(32).optional(),
    caseDiaryDate: z.coerce.date().optional(),
    status: z.enum(["draft", "finalized"]).optional(),
    body: bodySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export const listCaseDiariesQuerySchema = z.object({
  firNo: z.string().trim().min(1).max(64).optional(),
  scope: z.enum(["mine", "shared", "public", "all"]).optional(),
});

export const visibilityRequestOtpSchema = z.object({
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
});

export const visibilityConfirmSchema = z.object({
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  code: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export const shareRequestOtpSchema = z.object({
  recipientId: z.string().trim().min(1, "Select a recipient officer"),
});

export const shareConfirmSchema = z.object({
  recipientId: z.string().trim().min(1, "Select a recipient officer"),
  code: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export type CreateCaseDiaryInput = z.infer<typeof createCaseDiarySchema>;
export type UpdateCaseDiaryInput = z.infer<typeof updateCaseDiarySchema>;
export type ListCaseDiariesQuery = z.infer<typeof listCaseDiariesQuerySchema>;
export type VisibilityRequestOtpInput = z.infer<typeof visibilityRequestOtpSchema>;
export type VisibilityConfirmInput = z.infer<typeof visibilityConfirmSchema>;
export type ShareRequestOtpInput = z.infer<typeof shareRequestOtpSchema>;
export type ShareConfirmInput = z.infer<typeof shareConfirmSchema>;
