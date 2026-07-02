import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config/index.js";
import * as schema from "./schema.js";

// Supabase (both the pooler and any direct host) requires TLS. Enable it
// whenever the target looks like Supabase or the URL asks for it, so the same
// code runs locally and on Render without a plaintext-vs-TLS mismatch. Plain
// local Postgres keeps SSL off.
const requiresSsl = /supabase\.(co|com)|sslmode=require/.test(config.databaseUrl);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
