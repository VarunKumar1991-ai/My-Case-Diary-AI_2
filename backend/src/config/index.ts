import "dotenv/config";

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
    // Enabled only when SMTP credentials are present — keeps `ConsoleOtpSender`
    // as the sole sender for local setups that haven't configured SMTP yet.
    enabled: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: int("SMTP_PORT", 465),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "",
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
