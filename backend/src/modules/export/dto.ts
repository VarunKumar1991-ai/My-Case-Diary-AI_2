import { z } from "zod";

export const exportCaseDiaryQuerySchema = z.object({
  format: z.enum(["pdf", "docx", "txt"], { errorMap: () => ({ message: "format must be pdf, docx, or txt" }) }),
});

export type ExportCaseDiaryQuery = z.infer<typeof exportCaseDiaryQuerySchema>;
