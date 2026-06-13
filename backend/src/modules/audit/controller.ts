import type { Request, Response } from "express";
import { listAuditLogsQuerySchema } from "./dto.js";
import { listAuditLogs } from "./service.js";

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const query = listAuditLogsQuerySchema.parse(req.query);
  const logs = await listAuditLogs(query.limit ?? 100);
  res.json({ logs });
}
