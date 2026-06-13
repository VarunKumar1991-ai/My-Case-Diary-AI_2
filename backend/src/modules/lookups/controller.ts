import type { Request, Response } from "express";
import { listActiveCaseTypes, listActiveDesignations } from "./service.js";

export async function getCaseTypeLookups(_req: Request, res: Response): Promise<void> {
  res.json({ caseTypes: await listActiveCaseTypes() });
}

export async function getDesignationLookups(_req: Request, res: Response): Promise<void> {
  res.json({ designations: await listActiveDesignations() });
}
