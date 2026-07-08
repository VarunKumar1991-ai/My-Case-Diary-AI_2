import { config } from "../../config/index.js";

/**
 * LLM provider seam (D2-style). Both Claude and Gemini are wired behind one
 * interface; `AI_PROVIDER` selects which single backend is used at runtime, so
 * callers (the summary service, future search/draft features) never depend on a
 * specific vendor. Swapping providers is one env var — no code change.
 *
 * Both real providers are called over plain HTTPS (Node's global `fetch`), so
 * there is no heavyweight SDK dependency and the two implementations stay
 * symmetric.
 */
export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<string>;
}

/** Anthropic Claude — Messages API (docs.claude.com/.../v1/messages). */
class ClaudeProvider implements LlmProvider {
  readonly name = "claude";

  async complete({ system, prompt, maxTokens }: LlmRequest): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.ai.claude.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.ai.claude.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude request failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();
  }
}

/** Google Gemini — generateContent API (generativelanguage.googleapis.com). */
class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  async complete({ system, prompt, maxTokens }: LlmRequest): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.gemini.model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.ai.gemini.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini request failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }
}

/**
 * Keyless local/dev provider — same rationale as `ConsoleOtpSender` (D2): the
 * whole summary pipeline (route → access check → gathering CDs → prompt →
 * provider → UI) stays exercisable with zero external credentials. Deterministic
 * and offline. Set `AI_PROVIDER=claude|gemini` + the key for real output.
 */
class StubProvider implements LlmProvider {
  readonly name = "stub";

  async complete({ prompt }: LlmRequest): Promise<string> {
    return [
      "⚠️ यह एक demo सारांश है — कोई AI provider कॉन्फ़िगर नहीं है।",
      "असली सारांश के लिए AI_PROVIDER=claude या gemini और उसकी API key सेट करें।",
      "",
      `(इस मुकदमे का ${prompt.length} अक्षर का पाठ AI को भेजने हेतु तैयार किया गया।)`,
    ].join("\n");
  }
}

export function getLlmProvider(): LlmProvider {
  switch (config.ai.provider) {
    case "claude":
      return new ClaudeProvider();
    case "gemini":
      return new GeminiProvider();
    default:
      return new StubProvider();
  }
}

/** The model id backing the active provider (for audit/UI display). */
export function activeModel(): string {
  switch (config.ai.provider) {
    case "claude":
      return config.ai.claude.model;
    case "gemini":
      return config.ai.gemini.model;
    default:
      return "stub";
  }
}
