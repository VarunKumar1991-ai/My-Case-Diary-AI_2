import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import { summarizeCaseDiaryFir } from "./service.js";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

function requireDiaryId(req: Request): string {
  const value = req.params.id;
  if (!value) throw new ValidationError("Missing case diary id");
  return value;
}

export async function postAiSummary(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const summary = await summarizeCaseDiaryFir(user, requireDiaryId(req), buildContext(req));
  res.json(summary);
}
