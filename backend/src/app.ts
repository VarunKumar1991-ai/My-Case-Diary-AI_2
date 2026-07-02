import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "./config/index.js";
import { db } from "./db/client.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { adminRouter } from "./modules/admin/routes.js";
import { auditRouter } from "./modules/audit/routes.js";
import { authRouter, meRouter } from "./modules/auth/routes.js";
import { caseDiaryRouter } from "./modules/case-diary/routes.js";
import { lookupsRouter } from "./modules/lookups/routes.js";
import { userRouter } from "./modules/user/routes.js";

// Run pending DB migrations before accepting traffic so schema and code stay in sync.
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[db] Migrations up to date.");

export const app = express();

app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(authRouter);
app.use(meRouter);
app.use(lookupsRouter);
app.use(userRouter);
app.use(caseDiaryRouter);
app.use("/admin", auditRouter);
app.use("/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` },
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] My Case Diary AI backend listening on port ${config.port}`);
});
