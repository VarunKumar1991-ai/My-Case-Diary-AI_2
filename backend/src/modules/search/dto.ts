import { z } from "zod";

export const searchCaseDiariesQuerySchema = z.object({
  q: z.string().trim().min(1, "Enter a search term").max(200),
});

export type SearchCaseDiariesQuery = z.infer<typeof searchCaseDiariesQuerySchema>;
