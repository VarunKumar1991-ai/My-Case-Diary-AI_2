import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import {
  approvePrivateAccessRequestSchema,
  blockUserSchema,
  changeUserRoleSchema,
  createCaseTypeSchema,
  createDesignationSchema,
  createPrivateAccessRequestSchema,
  listPrivateAccessRequestsQuerySchema,
  listUsersQuerySchema,
  updateCaseTypeSchema,
  updateDesignationSchema,
  updateQuickSearchLimitSchema,
} from "./dto.js";
import {
  approvePrivateAccessRequest,
  blockUser,
  changeUserRole,
  createCaseType,
  createDesignation,
  deactivateCaseType,
  deactivateDesignation,
  denyPrivateAccessRequest,
  getQuickSearchLimit,
  listCaseTypes,
  listDesignations,
  listPrivateAccessRequests,
  listUsers,
  requestPrivateAccess,
  setQuickSearchLimit,
  unblockUser,
  updateCaseType,
  updateDesignation,
} from "./service.js";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

function buildContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new ValidationError(`Missing ${name}`);
  return value;
}

// ── Case Types ─────────────────────────────────────────────────────────────

export async function getCaseTypes(_req: Request, res: Response): Promise<void> {
  res.json({ caseTypes: await listCaseTypes() });
}

export async function postCaseType(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = createCaseTypeSchema.parse(req.body);
  const caseType = await createCaseType(admin, input, buildContext(req));
  res.status(201).json({ caseType });
}

export async function putCaseType(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = updateCaseTypeSchema.parse(req.body);
  const caseType = await updateCaseType(admin, requireParam(req, "id"), input, buildContext(req));
  res.json({ caseType });
}

export async function deleteCaseTypeHandler(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  await deactivateCaseType(admin, requireParam(req, "id"), buildContext(req));
  res.status(204).send();
}

// ── Designations ───────────────────────────────────────────────────────────

export async function getDesignations(_req: Request, res: Response): Promise<void> {
  res.json({ designations: await listDesignations() });
}

export async function postDesignation(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = createDesignationSchema.parse(req.body);
  const designation = await createDesignation(admin, input, buildContext(req));
  res.status(201).json({ designation });
}

export async function putDesignation(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = updateDesignationSchema.parse(req.body);
  const designation = await updateDesignation(admin, requireParam(req, "id"), input, buildContext(req));
  res.json({ designation });
}

export async function deleteDesignationHandler(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  await deactivateDesignation(admin, requireParam(req, "id"), buildContext(req));
  res.status(204).send();
}

// ── App settings ───────────────────────────────────────────────────────────

export async function getQuickSearchSettings(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  res.json({ limit: await getQuickSearchLimit(admin) });
}

export async function putQuickSearchSettings(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const { limit } = updateQuickSearchLimitSchema.parse(req.body);
  res.json({ limit: await setQuickSearchLimit(admin, limit, buildContext(req)) });
}

// ── User governance ────────────────────────────────────────────────────────

export async function getUsers(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const query = listUsersQuerySchema.parse(req.query);
  res.json({ users: await listUsers(admin, query) });
}

export async function postBlockUser(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = blockUserSchema.parse(req.body);
  const user = await blockUser(admin, requireParam(req, "id"), input, buildContext(req));
  res.json({ user });
}

export async function postUnblockUser(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const user = await unblockUser(admin, requireParam(req, "id"), buildContext(req));
  res.json({ user });
}

export async function postChangeUserRole(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = changeUserRoleSchema.parse(req.body);
  const user = await changeUserRole(admin, requireParam(req, "id"), input, buildContext(req));
  res.json({ user });
}

// ── Private Access Approvals ───────────────────────────────────────────────

export async function getPrivateAccessRequests(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const query = listPrivateAccessRequestsQuerySchema.parse(req.query);
  res.json({ requests: await listPrivateAccessRequests(admin, query) });
}

export async function postPrivateAccessRequest(req: Request, res: Response): Promise<void> {
  const admin = requireUser(req);
  const input = createPrivateAccessRequestSchema.parse(req.body);
  const request = await requestPrivateAccess(admin, input, buildContext(req));
  res.status(201).json({ request });
}

export async function postApprovePrivateAccessRequest(req: Request, res: Response): Promise<void> {
  const adg = requireUser(req);
  const input = approvePrivateAccessRequestSchema.parse(req.body);
  const request = await approvePrivateAccessRequest(adg, requireParam(req, "id"), input, buildContext(req));
  res.json({ request });
}

export async function postDenyPrivateAccessRequest(req: Request, res: Response): Promise<void> {
  const adg = requireUser(req);
  const request = await denyPrivateAccessRequest(adg, requireParam(req, "id"), buildContext(req));
  res.json({ request });
}
