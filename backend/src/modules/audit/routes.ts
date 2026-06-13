import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { requireRole } from "../../middleware/rbacGuard.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { getAuditLogs } from "./controller.js";

export const auditRouter = Router();

auditRouter.get("/audit-logs", authGuard, requireRole("ADMIN"), asyncHandler(getAuditLogs));
