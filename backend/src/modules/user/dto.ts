import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120).optional(),
    designation: z.string().trim().min(2).max(80).optional(),
    // Diary-body font size preference, in px. Bounds mirror the editor's own
    // MIN/MAX so a stale client can't store something unusable.
    editorFontSize: z.coerce.number().int().min(8).max(72).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
    path: ["name"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
