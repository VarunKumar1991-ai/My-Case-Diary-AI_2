import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { authRateLimiter, otpRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import {
  getCurrentUser,
  logout,
  refresh,
  signinRequestOtp,
  signinVerify,
  signupRequestOtp,
  signupVerify,
} from "./controller.js";

export const authRouter = Router();

authRouter.post("/auth/signup/request-otp", otpRateLimiter, asyncHandler(signupRequestOtp));
authRouter.post("/auth/signup/verify", otpRateLimiter, asyncHandler(signupVerify));
authRouter.post("/auth/signin/request-otp", otpRateLimiter, asyncHandler(signinRequestOtp));
authRouter.post("/auth/signin/verify", otpRateLimiter, asyncHandler(signinVerify));
authRouter.post("/auth/refresh", authRateLimiter, asyncHandler(refresh));
authRouter.post("/auth/logout", authRateLimiter, asyncHandler(logout));

export const meRouter = Router();
meRouter.get("/me", authGuard, asyncHandler(getCurrentUser));
