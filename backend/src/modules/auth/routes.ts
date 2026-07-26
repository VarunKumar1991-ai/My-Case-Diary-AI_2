import { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { authRateLimiter, otpRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import {
  changePassword,
  getCurrentUser,
  logout,
  refresh,
  resetPassword,
  signinPassword,
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
// ID/password sign-in — rate-limited like the other credential endpoints so
// passwords can't be brute-forced.
authRouter.post("/auth/signin/password", authRateLimiter, asyncHandler(signinPassword));
authRouter.post("/auth/password/change", authGuard, authRateLimiter, asyncHandler(changePassword));
// "Forgot password?" — unauthenticated, but the current password is still
// required, so it is rate-limited exactly like a sign-in attempt.
authRouter.post("/auth/password/reset", authRateLimiter, asyncHandler(resetPassword));

authRouter.post("/auth/refresh", authRateLimiter, asyncHandler(refresh));
authRouter.post("/auth/logout", authRateLimiter, asyncHandler(logout));

export const meRouter = Router();
meRouter.get("/me", authGuard, asyncHandler(getCurrentUser));
