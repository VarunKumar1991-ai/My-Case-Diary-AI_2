import dotenv from "dotenv";

// Base env, then the editable prompt file (a plain key=value data file — NOT
// code — so prompts can be changed without any risk of breaking source). Real
// .env / Render-dashboard values still win, since dotenv never overrides an
// already-set variable.
dotenv.config();
dotenv.config({ path: "ai-prompts.env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

const sameSite = (process.env.COOKIE_SAME_SITE ?? "lax") as "lax" | "none" | "strict";

// One LLM backend is active at a time, chosen by AI_PROVIDER (both Claude and
// Gemini are wired; "stub" is a keyless local/dev echo — same idea as
// ConsoleOtpSender, so the AI features stay runnable without any credentials).
const aiProvider = (process.env.AI_PROVIDER ?? "claude") as "claude" | "gemini" | "stub";

// Default prompts (used when ai-prompts.env / env doesn't set them). Overridable
// entirely from ai-prompts.env — see that file. `\n` in the env value becomes a
// real newline, so multi-line prompts work as single-line quoted values there.
const DEFAULT_SUMMARY_SYSTEM = [
  "आप एक पुलिस केस-डायरी सहायक हैं। आपको एक मुकदमे (FIR) की केस डायरियों का पाठ दिया जाएगा।",
  "इनका संक्षिप्त, तथ्यपरक सारांश शुद्ध हिंदी में दें, इन नियमों के साथ:",
  "- केवल दिए गए पाठ के आधार पर लिखें; कोई नई बात, धारा, नाम या तिथि स्वयं न जोड़ें।",
  "- घटनाक्रम, अब तक की गई विवेचना/कार्रवाई, और वर्तमान स्थिति क्रमवार बताएँ।",
  "- यदि पाठ में जानकारी अधूरी हो तो वैसा ही लिखें; अनुमान न लगाएँ।",
  "सारांश संक्षिप्त और बिंदुवार रखें।",
].join("\n");
const DEFAULT_SUMMARY_INSTRUCTION = "ऊपर दिए गए मुकदमे की सभी केस डायरियों का सारांश दें।";

export const config = {
  port: int("PORT", 4000),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtlMinutes: int("JWT_ACCESS_TTL_MINUTES", 15),
    refreshTtlDays: int("JWT_REFRESH_TTL_DAYS", 7),
  },
  otp: {
    pepper: required("OTP_PEPPER"),
    ttlMinutes: int("OTP_TTL_MINUTES", 5),
    maxAttempts: int("OTP_MAX_ATTEMPTS", 5),
  },
  email: {
    // Enabled only when a Resend API key is present — keeps `ConsoleOtpSender`
    // as the sole sender for local setups that haven't configured email yet.
    enabled: Boolean(process.env.RESEND_API_KEY),
    apiKey: process.env.RESEND_API_KEY ?? "",
    // Resend requires the sender address to be on a verified domain. Defaults to
    // Resend's shared testing sender, which only delivers to your own account email.
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
  },
  whatsapp: {
    // Enabled only when Twilio credentials are present — keeps `ConsoleOtpSender`
    // as the sole sender for local setups that haven't configured WhatsApp yet.
    // The Twilio Sandbox number/credentials are free and require no business
    // verification — each recipient just sends the sandbox join code once.
    enabled: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    from: process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886",
  },
  ai: {
    // Which single provider is used. Both are integrated; only the selected one runs.
    provider: aiProvider,
    // Feature is usable when the keyless stub is selected, or the chosen real
    // provider has its API key set (mirrors email/whatsapp gating above).
    enabled:
      aiProvider === "stub" ||
      (aiProvider === "claude" && Boolean(process.env.ANTHROPIC_API_KEY)) ||
      (aiProvider === "gemini" && Boolean(process.env.GEMINI_API_KEY)),
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      // Default per Anthropic guidance; override to claude-sonnet-5 / claude-haiku-4-5 for lower cost.
      model: process.env.CLAUDE_MODEL ?? "claude-opus-4-8",
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY ?? "",
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    },
    maxTokens: int("AI_MAX_TOKENS", 5000),
    // Prompts live in ai-prompts.env (editable data file), not in code. `\n` in
    // the value is turned into a real newline so multi-line prompts stay one line.
    summarySystemPrompt: (process.env.AI_SUMMARY_SYSTEM_PROMPT ?? DEFAULT_SUMMARY_SYSTEM).replace(/\\n/g, "\n"),
    summaryUserInstruction: (process.env.AI_SUMMARY_USER_INSTRUCTION ?? DEFAULT_SUMMARY_INSTRUCTION).replace(/\\n/g, "\n"),
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  cookie: {
    sameSite,
    secure: sameSite === "none" ? true : process.env.NODE_ENV === "production",
  },
} as const;
