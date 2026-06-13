import { z } from "zod";

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120).optional(),
    designation: z.string().trim().min(2).max(80).optional(),
  })
  .refine((data) => data.name !== undefined || data.designation !== undefined, {
    message: "Provide at least one field to update",
    path: ["name"],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
