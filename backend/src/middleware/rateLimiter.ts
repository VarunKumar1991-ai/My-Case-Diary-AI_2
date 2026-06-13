import rateLimit from "express-rate-limit";

/** Per-IP guard on OTP request/verify endpoints — pairs with per-identifier limits in the service layer. */
export const otpRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts — please try again later" } },
});

/** Broader guard on the rest of the auth surface (refresh, logout). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests — please try again later" } },
});
