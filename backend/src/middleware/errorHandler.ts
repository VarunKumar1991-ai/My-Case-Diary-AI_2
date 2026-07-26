import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    // Surface the first concrete issue as the message — clients show `message`
    // directly, and "Password must be at least 8 characters" is far more use to
    // an officer than a generic "Request validation failed". `details` still
    // carries the full per-field breakdown.
    const firstIssue = err.issues[0]?.message;
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: firstIssue ?? "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
