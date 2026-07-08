import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { appSettings } from "../../db/schema.js";

/**
 * Site-wide, admin-tunable settings backed by the `app_settings` key/value
 * table. Kept deliberately tiny: readers ask for a specific typed knob (with a
 * built-in default so a missing row is never an error), and writers upsert a
 * single key. Everything is stored as text and parsed on read.
 */

// ── Home quick-search chip count ───────────────────────────────────────────
// How many quick-search chips the Home page shows below the search box. The
// chips themselves are the active case-type taxonomy (admin-managed); this only
// caps how many of them appear. 0 hides the chips entirely.

const QUICK_SEARCH_LIMIT_KEY = "home_quick_search_limit";
export const DEFAULT_QUICK_SEARCH_LIMIT = 6;
export const MAX_QUICK_SEARCH_LIMIT = 24;

async function readSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Current chip count — clamped to a sane range; falls back to the default. */
export async function getQuickSearchLimit(): Promise<number> {
  const raw = await readSetting(QUICK_SEARCH_LIMIT_KEY);
  if (raw === null) return DEFAULT_QUICK_SEARCH_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_QUICK_SEARCH_LIMIT;
  return Math.min(Math.max(parsed, 0), MAX_QUICK_SEARCH_LIMIT);
}

/** Persist a new chip count. Caller is responsible for validating the range. */
export async function setQuickSearchLimit(limit: number): Promise<void> {
  const clamped = Math.min(Math.max(Math.trunc(limit), 0), MAX_QUICK_SEARCH_LIMIT);
  await writeSetting(QUICK_SEARCH_LIMIT_KEY, String(clamped));
}
