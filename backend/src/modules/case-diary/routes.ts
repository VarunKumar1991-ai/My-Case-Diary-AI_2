import express, { Router } from "express";
import { authGuard } from "../../middleware/authGuard.js";
import { otpRateLimiter } from "../../middleware/rateLimiter.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { postAiSummary } from "../ai/controller.js";
import { postCaseDiaryExport } from "../export/controller.js";
import { getCaseDiariesSearch, getSimilarCaseDiaries } from "../search/controller.js";
import {
  deleteCaseDiaryHandler,
  getCaseDiaries,
  getCaseDiary,
  getCaseDiaryRevisions,
  getNextCaseDiaryNo,
  getShareLog,
  postCaseDiary,
  postShareConfirm,
  postShareRequestOtp,
  postVisibilityConfirm,
  postVisibilityRequestOtp,
  putCaseDiary,
} from "./controller.js";

export const caseDiaryRouter = Router();

caseDiaryRouter.use("/case-diaries", authGuard);

caseDiaryRouter.get("/case-diaries", asyncHandler(getCaseDiaries));
caseDiaryRouter.post("/case-diaries", asyncHandler(postCaseDiary));

// `GET /case-diaries/search` is owned by the `search` module (D6) but MUST be
// registered here, before the generic `:id` route below — otherwise Express
// would capture "search" as `:id` and this fetch-by-id handler would shadow it.
caseDiaryRouter.get("/case-diaries/search", asyncHandler(getCaseDiariesSearch));
caseDiaryRouter.get("/case-diaries/next-no", asyncHandler(getNextCaseDiaryNo));

caseDiaryRouter.get("/case-diaries/:id", asyncHandler(getCaseDiary));
caseDiaryRouter.put("/case-diaries/:id", asyncHandler(putCaseDiary));
// POST alias for the beforeunload/tab-close flush only: a `fetch(..., { keepalive:
// true })` can survive page unload ONLY for a CORS-simple request (no preflight).
// PUT is never a simple method, and a declared `Content-Type: application/json`
// isn't a simple content type either — either one forces a preflight, which
// keepalive does not support, so the browser silently drops the save on real
// unload. This route lets the flush use POST with no Content-Type header (the
// browser then defaults to `text/plain`, which is preflight-exempt); `type: () =>
// true` forces express.json to parse that body anyway.
caseDiaryRouter.post("/case-diaries/:id", express.json({ type: () => true }), asyncHandler(putCaseDiary));
caseDiaryRouter.delete("/case-diaries/:id", asyncHandler(deleteCaseDiaryHandler));
caseDiaryRouter.get("/case-diaries/:id/revisions", asyncHandler(getCaseDiaryRevisions));

// Also owned by the `search` module (D7) — `:id/similar` is unambiguous
// relative to `:id` (an extra path segment), so ordering doesn't matter here.
caseDiaryRouter.get("/case-diaries/:id/similar", asyncHandler(getSimilarCaseDiaries));

// Owned by the `export` module (§6.6) — same "extra segment" reasoning as `:id/similar`.
caseDiaryRouter.post("/case-diaries/:id/export", asyncHandler(postCaseDiaryExport));

// Owned by the `ai` module (Phase-1) — FIR-wide AI summary; `:id/ai-summary` is
// an unambiguous extra segment relative to `:id`.
caseDiaryRouter.post("/case-diaries/:id/ai-summary", asyncHandler(postAiSummary));

caseDiaryRouter.post(
  "/case-diaries/:id/visibility/request-otp",
  otpRateLimiter,
  asyncHandler(postVisibilityRequestOtp),
);
caseDiaryRouter.post(
  "/case-diaries/:id/visibility/confirm",
  otpRateLimiter,
  asyncHandler(postVisibilityConfirm),
);
caseDiaryRouter.post("/case-diaries/:id/share/request-otp", otpRateLimiter, asyncHandler(postShareRequestOtp));
caseDiaryRouter.post("/case-diaries/:id/share/confirm", otpRateLimiter, asyncHandler(postShareConfirm));
caseDiaryRouter.get("/case-diaries/:id/share-log", asyncHandler(getShareLog));
