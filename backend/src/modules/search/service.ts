import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { caseDiaries, caseTypes } from "../../db/schema.js";
import type { AuthenticatedUser } from "../../middleware/authGuard.js";
import { extractPlainText } from "../../shared/richText.js";
import { buildBrowseScopeCondition } from "../case-diary/service.js";

type CaseDiaryRow = typeof caseDiaries.$inferSelect;

const SUGGESTION_LIMIT = 5;
const SUGGESTION_CANDIDATE_POOL = 100;

// ── Search (D6) ────────────────────────────────────────────────────────────

/**
 * §6.4 names the indexed fields as `caseDiaryNo, caseType.name, underSection,
 * firNo, body`. The first four are plain text columns, so a standard
 * `to_tsvector` over their concatenation covers them; `body` is a
 * Tiptap/ProseMirror JSON document, so we lean on Postgres's native
 * `jsonb_to_tsvector(..., '["string"]')` to index every text node it contains
 * — no application-side JSON walk needed at query time. The two vectors are
 * concatenated with `||` (tsvector concatenation) before matching.
 */
const SEARCH_VECTOR = sql`(
  to_tsvector('english',
    coalesce(${caseDiaries.caseDiaryNo}, '') || ' ' ||
    coalesce(${caseTypes.name}, '') || ' ' ||
    coalesce(${caseDiaries.underSection}, '') || ' ' ||
    coalesce(${caseDiaries.firNo}, '')
  ) || jsonb_to_tsvector('english', ${caseDiaries.body}, '["string"]')
)`;

/**
 * D6: isolated behind an interface so controllers/UI depend only on
 * `searchService` — a Phase-2 embedding-backed implementation becomes a
 * one-line swap of the exported singleton, never a rewrite of call sites.
 */
export interface SearchService {
  search(user: AuthenticatedUser, query: string): Promise<CaseDiaryRow[]>;
}

class KeywordSearchService implements SearchService {
  async search(user: AuthenticatedUser, query: string): Promise<CaseDiaryRow[]> {
    const scopeCondition = await buildBrowseScopeCondition(user);

    const rows = await db
      .select({ caseDiary: caseDiaries })
      .from(caseDiaries)
      .innerJoin(caseTypes, eq(caseTypes.id, caseDiaries.caseTypeId))
      .where(
        and(
          isNull(caseDiaries.deletedAt),
          scopeCondition,
          sql`${SEARCH_VECTOR} @@ websearch_to_tsquery('english', ${query})`,
        ),
      )
      .orderBy(desc(caseDiaries.updatedAt))
      .limit(50);

    return rows.map((row) => row.caseDiary);
  }
}

export const searchService: SearchService = new KeywordSearchService();

// ── Similar-case suggestions (D7) ──────────────────────────────────────────

/**
 * D7: the seam Phase 2 will swap for an embeddings/vector-store/LLM-backed
 * implementation (§11) — controllers/UI must depend only on this interface.
 */
export interface SimilarCaseService {
  findSimilar(user: AuthenticatedUser, diary: CaseDiaryRow): Promise<CaseDiaryRow[]>;
}

/** Lowercased word tokens ≥3 chars; the Devanagari range is included so Hindi-script bodies (§"Localization") tokenize sensibly once entered. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9\p{Script=Devanagari}]+/iu)
      .filter((token) => token.length >= 3),
  );
}

function overlapScore(source: Set<string>, candidate: Set<string>): number {
  let shared = 0;
  for (const token of source) {
    if (candidate.has(token)) shared += 1;
  }
  return shared;
}

function diaryTokens(diary: CaseDiaryRow): Set<string> {
  return tokenize(`${diary.underSection} ${extractPlainText(diary.body)}`);
}

/**
 * D7: ranks by shared `caseTypeId` (the cheap, DB-side first-pass filter) then
 * keyword overlap in `underSection`/`body` (the app-side ranking signal).
 * Cheap, deterministic, and gives the right-panel something real to show
 * without an LLM/vector store — the interface signature already matches what
 * an embeddings-backed Phase-2 implementation would need.
 */
class KeywordOverlapSuggestionService implements SimilarCaseService {
  async findSimilar(user: AuthenticatedUser, diary: CaseDiaryRow): Promise<CaseDiaryRow[]> {
    const scopeCondition = await buildBrowseScopeCondition(user);

    const candidates = await db
      .select()
      .from(caseDiaries)
      .where(
        and(
          isNull(caseDiaries.deletedAt),
          ne(caseDiaries.id, diary.id),
          eq(caseDiaries.caseTypeId, diary.caseTypeId),
          scopeCondition,
        ),
      )
      .orderBy(desc(caseDiaries.updatedAt))
      .limit(SUGGESTION_CANDIDATE_POOL);

    const sourceTokens = diaryTokens(diary);

    return candidates
      .map((candidate) => ({ candidate, score: overlapScore(sourceTokens, diaryTokens(candidate)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, SUGGESTION_LIMIT)
      .map((entry) => entry.candidate);
  }
}

export const suggestionService: SimilarCaseService = new KeywordOverlapSuggestionService();
