import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import {
  createCaseDiarySchema,
  listCaseDiariesQuerySchema,
  shareConfirmSchema,
  shareRequestOtpSchema,
  updateCaseDiarySchema,
  visibilityConfirmSchema,
  visibilityRequestOtpSchema,
} from "./dto.js";
import {
  confirmShare,
  confirmVisibilityChange,
  createCaseDiary,
  deleteCaseDiary,
  generateNextCaseDiaryNo,
  getCaseDiaryById,
  getFirShareLog,
  listCaseDiaries,
  listCaseDiaryRevisions,
  requestShareOtp,
  requestVisibilityChangeOtp,
  updateCaseDiary,
} from "./service.js";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

function requireDiaryId(req: Request): string {
  const id = req.params.id;
  if (!id) throw new ValidationError("Missing case diary id");
  return id;
}

export async function getNextCaseDiaryNo(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  // CD No. is scoped per FIR; the client passes the FIR it's drafting for (if any).
  const firNo = typeof req.query.firNo === "string" ? req.query.firNo : "";
  const caseDiaryNo = await generateNextCaseDiaryNo(user.id, firNo);
  res.json({ caseDiaryNo });
}

export async function postCaseDiary(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = createCaseDiarySchema.parse(req.body);
  const diary = await createCaseDiary(user, input, buildContext(req));
  res.status(201).json({ caseDiary: diary });
}

export async function getCaseDiaries(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const query = listCaseDiariesQuerySchema.parse(req.query);
  const diaries = await listCaseDiaries(user, query);
  res.json({ caseDiaries: diaries });
}

export async function getCaseDiary(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const diary = await getCaseDiaryById(user, requireDiaryId(req), buildContext(req));
  res.json({ caseDiary: diary });
}

export async function putCaseDiary(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = updateCaseDiarySchema.parse(req.body);
  const diary = await updateCaseDiary(user, requireDiaryId(req), input, buildContext(req));
  res.json({ caseDiary: diary });
}

export async function deleteCaseDiaryHandler(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  await deleteCaseDiary(user, requireDiaryId(req), buildContext(req));
  res.status(204).send();
}

export async function getCaseDiaryRevisions(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const revisions = await listCaseDiaryRevisions(user, requireDiaryId(req));
  res.json({ revisions });
}

export async function postVisibilityRequestOtp(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = visibilityRequestOtpSchema.parse(req.body);
  await requestVisibilityChangeOtp(user, requireDiaryId(req), input, buildContext(req));
  res.status(202).json({ message: "An OTP has been sent to confirm making this case diary public." });
}

export async function postVisibilityConfirm(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = visibilityConfirmSchema.parse(req.body);
  const diary = await confirmVisibilityChange(user, requireDiaryId(req), input, buildContext(req));
  res.json({ caseDiary: diary });
}

export async function postShareRequestOtp(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = shareRequestOtpSchema.parse(req.body);
  await requestShareOtp(user, requireDiaryId(req), input, buildContext(req));
  res.status(202).json({ message: "An OTP has been sent to confirm sharing this case diary." });
}

export async function postShareConfirm(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  const input = shareConfirmSchema.parse(req.body);
  const share = await confirmShare(user, requireDiaryId(req), input, buildContext(req));
  res.status(201).json({ share });
}

export async function getShareLog(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  res.json(await getFirShareLog(user, requireDiaryId(req)));
}
