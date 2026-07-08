import type { Request, Response } from "express";
import { UnauthorizedError } from "../../shared/errors.js";
import { getQuickSearchLimit } from "../settings/service.js";
import { listActiveCaseTypes, listActiveDesignations, searchOfficers } from "./service.js";

export async function getCaseTypeLookups(_req: Request, res: Response): Promise<void> {
  res.json({ caseTypes: await listActiveCaseTypes() });
}

export async function getDesignationLookups(_req: Request, res: Response): Promise<void> {
  res.json({ designations: await listActiveDesignations() });
}

export async function getQuickSearchConfig(_req: Request, res: Response): Promise<void> {
  res.json({ limit: await getQuickSearchLimit() });
}

export async function getOfficerLookups(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  res.json({ officers: await searchOfficers(q || undefined, req.user.id) });
}
