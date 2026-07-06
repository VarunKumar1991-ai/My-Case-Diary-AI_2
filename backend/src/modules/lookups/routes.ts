import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { getCaseTypeLookups, getDesignationLookups, getOfficerLookups } from "./controller.js";

export const lookupsRouter = Router();

// Unauthenticated on purpose — designation *names* carry no sensitive
// information (§6.1 "designation (admin-configurable enum)").
lookupsRouter.get("/designations", asyncHandler(getDesignationLookups));

// Case types are only ever picked from an authenticated context (creating/editing
// a diary), so this one stays behind `authGuard`.
lookupsRouter.get("/case-types", authGuard, asyncHandler(getCaseTypeLookups));

// Officer directory for the diary-share recipient picker — authenticated officers only.
lookupsRouter.get("/officers", authGuard, asyncHandler(getOfficerLookups));
