import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { requireRole } from "../../middleware/rbacGuard.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import {
  deleteCaseTypeHandler,
  deleteDesignationHandler,
  postChangeUserRole,
  getCaseTypes,
  getDesignations,
  getPrivateAccessRequests,
  getQuickSearchSettingsHandler,
  getUsers,
  postApprovePrivateAccessRequest,
  postBlockUser,
  postCaseType,
  postDenyPrivateAccessRequest,
  postDesignation,
  postPrivateAccessRequest,
  postUnblockUser,
  putCaseType,
  putDesignation,
  putQuickSearchSettings,
} from "./controller.js";

/**
 * Mounted at `/admin` (see app.ts, alongside `auditRouter`). Every route here
 * requires an authenticated session AND the `ADMIN` role — `authGuard` then
 * `requireRole("ADMIN")` form enforcement layers #1/#2; the service layer
 * re-checks independently (and further gates the approval-decision endpoint to
 * the "ADG (Technical)" designation specifically — see admin/service.ts).
 */
export const adminRouter = Router();

adminRouter.use(authGuard, requireRole("ADMIN"));

adminRouter.get("/settings/quick-search", asyncHandler(getQuickSearchSettingsHandler));
adminRouter.put("/settings/quick-search", asyncHandler(putQuickSearchSettings));

adminRouter.get("/case-types", asyncHandler(getCaseTypes));
adminRouter.post("/case-types", asyncHandler(postCaseType));
adminRouter.put("/case-types/:id", asyncHandler(putCaseType));
adminRouter.delete("/case-types/:id", asyncHandler(deleteCaseTypeHandler));

adminRouter.get("/designations", asyncHandler(getDesignations));
adminRouter.post("/designations", asyncHandler(postDesignation));
adminRouter.put("/designations/:id", asyncHandler(putDesignation));
adminRouter.delete("/designations/:id", asyncHandler(deleteDesignationHandler));

adminRouter.get("/users", asyncHandler(getUsers));
adminRouter.post("/users/:id/block", asyncHandler(postBlockUser));
adminRouter.post("/users/:id/unblock", asyncHandler(postUnblockUser));
adminRouter.post("/users/:id/role", asyncHandler(postChangeUserRole));

adminRouter.get("/private-access-requests", asyncHandler(getPrivateAccessRequests));
adminRouter.post("/private-access-requests", asyncHandler(postPrivateAccessRequest));
adminRouter.post("/private-access-requests/:id/approve", asyncHandler(postApprovePrivateAccessRequest));
adminRouter.post("/private-access-requests/:id/deny", asyncHandler(postDenyPrivateAccessRequest));
