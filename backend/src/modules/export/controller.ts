import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import { exportCaseDiaryQuerySchema } from "./dto.js";
import { exportCaseDiary } from "./service.js";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

export async function postCaseDiaryExport(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const id = req.params.id;
  if (!id) throw new ValidationError("Missing case diary id");

  const { format } = exportCaseDiaryQuerySchema.parse(req.query);
  const result = await exportCaseDiary(user, id, format, buildContext(req));

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.send(result.buffer);
}
