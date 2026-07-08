import { and, asc, eq, isNull } from "drizzle-orm";
import { config } from "../../config/index.js";
import { db } from "../../db/client.js";
import { caseDiaries } from "../../db/schema.js";
import type { AuthenticatedUser } from "../../middleware/authGuard.js";
import { ValidationError } from "../../shared/errors.js";
import type { RequestContext } from "../../shared/http.js";
import { extractPlainText } from "../../shared/richText.js";
import { recordAuditEntry } from "../audit/service.js";
import { buildBrowseScopeCondition, getCaseDiaryById } from "../case-diary/service.js";
import { activeModel, getLlmProvider } from "./provider.js";

/** Cap the prompt so a very long मुकदमा can't blow up latency/cost. */
const MAX_INPUT_CHARS = 12000;

export interface CaseDiarySummary {
  firNo: string;
  provider: string;
  model: string;
  diaryCount: number;
  summary: string;
}

const SYSTEM_PROMPT = [
  "आप एक पुलिस केस-डायरी सहायक हैं। आपको एक मुकदमे (FIR) की केस डायरियों का पाठ दिया जाएगा।",
  "इनका संक्षिप्त, तथ्यपरक सारांश शुद्ध हिंदी में दें, इन नियमों के साथ:",
  "- केवल दिए गए पाठ के आधार पर लिखें; कोई नई बात, धारा, नाम या तिथि स्वयं न जोड़ें।",
  "- घटनाक्रम, अब तक की गई विवेचना/कार्रवाई, और वर्तमान स्थिति क्रमवार बताएँ।",
  "- यदि पाठ में जानकारी अधूरी हो तो वैसा ही लिखें; अनुमान न लगाएँ।",
  "सारांश संक्षिप्त और बिंदुवार रखें।",
].join("\n");

/**
 * Phase-1 AI feature: summarize a whole मुकदमा (FIR). Gathers exactly the case
 * diaries under this FIR that the caller is allowed to see (visibility-scoped),
 * builds a grounded prompt from their bodies, and asks the active LLM provider
 * for a Hindi summary. The result is advisory — the officer verifies it.
 */
export async function summarizeCaseDiaryFir(
  user: AuthenticatedUser,
  diaryId: string,
  context: RequestContext,
): Promise<CaseDiarySummary> {
  if (!config.ai.enabled) {
    throw new ValidationError(
      "AI summarization is not configured. Set AI_PROVIDER (claude/gemini) and the provider's API key.",
    );
  }

  // Access-gated load of the anchor diary (throws 403/404 if not viewable).
  const anchor = await getCaseDiaryById(user, diaryId, context);

  // Every case diary of this FIR that *this* user is allowed to see.
  const scope = await buildBrowseScopeCondition(user);
  const rows = await db
    .select()
    .from(caseDiaries)
    .where(and(eq(caseDiaries.firNo, anchor.firNo), isNull(caseDiaries.deletedAt), scope))
    .orderBy(asc(caseDiaries.createdAt));

  if (rows.length === 0) {
    throw new ValidationError("No readable case diaries found for this मुकदमा.");
  }

  const header =
    `मुकदमा (FIR) नं.: ${anchor.firNo}\n` +
    `थाना: ${anchor.policeStation}\n` +
    `वादी: ${anchor.plaintiffName}  बनाम  अभियुक्त: ${anchor.accusedName}\n`;

  let corpus = "";
  rows.forEach((diary, index) => {
    corpus +=
      `\n--- केस डायरी ${index + 1} (सं. ${diary.caseDiaryNo}) ---\n` +
      `धारा: ${diary.underSection}\n` +
      `${extractPlainText(diary.body)}\n`;
  });
  if (corpus.length > MAX_INPUT_CHARS) {
    corpus = `${corpus.slice(0, MAX_INPUT_CHARS)}\n…(पाठ संक्षिप्त किया गया)`;
  }

  const provider = getLlmProvider();
  let summary: string;
  const prompt = `${header}${corpus}\n\n\n\n ऊपर दिए गए मुकदमे की सभी केस डायरियों का सारांश दें।`;
  try {
    summary = await provider.complete({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: config.ai.maxTokens,
    });
  } catch (err) {
    // Surface the upstream reason (e.g. billing/quota/auth) to the officer instead
    // of a generic 500 — these are actionable ("credit balance too low", etc.).
    const detail = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`AI provider (${provider.name}) request failed. ${detail}`.slice(0, 500));
  }

  const model = activeModel();
  await recordAuditEntry({
    actorId: user.id,
    action: "ai.case_diary_summarized",
    resourceType: "case_diary",
    resourceId: anchor.id,
    metadata: { firNo: anchor.firNo, provider: provider.name, model, diaryCount: rows.length },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { firNo: anchor.firNo, provider: provider.name, model, diaryCount: rows.length, summary };
}
