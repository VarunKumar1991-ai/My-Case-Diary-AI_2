import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { authRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { patchOwnProfile } from "./controller.js";

/** Mounted at root alongside the auth module's `meRouter` — together they form the `/me` resource (GET vs PATCH). */
export const userRouter = Router();

userRouter.patch("/me", authGuard, authRateLimiter, asyncHandler(patchOwnProfile));
