import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import { getCaseDiaryById } from "../case-diary/service.js";
import { searchCaseDiariesQuerySchema } from "./dto.js";
import { searchService, suggestionService } from "./service.js";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

export async function getCaseDiariesSearch(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const { q } = searchCaseDiariesQuerySchema.parse(req.query);
  const caseDiaries = await searchService.search(user, q);
  res.json({ caseDiaries });
}

export async function getSimilarCaseDiaries(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const id = req.params.id;
  if (!id) throw new ValidationError("Missing case diary id");

  // Reuses the same load + visibility check + view-audit path as `GET /case-diaries/:id` —
  // you must be able to see the source diary before its neighbours can be suggested.
  const diary = await getCaseDiaryById(user, id, buildContext(req));
  const caseDiaries = await suggestionService.findSimilar(user, diary);
  res.json({ caseDiaries });
}
