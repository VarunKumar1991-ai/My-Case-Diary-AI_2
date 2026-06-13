import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  const startedAt = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        route: req.originalUrl,
        status: res.statusCode,
        latencyMs,
        userId: req.user?.id ?? null,
      }),
    );
  });

  next();
}
