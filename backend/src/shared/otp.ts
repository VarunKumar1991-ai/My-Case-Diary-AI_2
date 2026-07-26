import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { config } from "../config/index.js";

const HASH_ROUNDS = 10;

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(`${code}${config.otp.pepper}`, HASH_ROUNDS);
}

export async function verifyOtpCode(code: string, hashedCode: string): Promise<boolean> {
  return bcrypt.compare(`${code}${config.otp.pepper}`, hashedCode);
}

/**
 * Delivery is abstracted behind this interface (Design Decision D2): no SMS/email
 * provider was specified, so Phase 1 ships a log-based sender that keeps the system
 * runnable without external credentials. Swapping to a real provider is a one-file change.
 */
export interface OtpSender {
  send(identifier: string, code: string, purpose: string): Promise<void>;
}

class ConsoleOtpSender implements OtpSender {
  async send(identifier: string, code: string, purpose: string): Promise<void> {
    console.log(`[otp:${purpose}] OTP for ${identifier} is ${code} (expires in ${config.otp.ttlMinutes}m)`);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const APP_NAME = "My Case Diary AI";

/** A short, human phrase describing why the code was requested (for context). */
function purposeReason(purpose: string): string {
  switch (purpose) {
    case "signup":
      return "to complete your sign-up";
    case "signin":
      return "to sign in";
    case "share-confirmation":
      return "to confirm sharing a case diary";
    case "visibility-change":
      return "to change a case diary's visibility";
    default:
      return "for your account";
  }
}

/**
 * Builds a professional, GitHub-style verification email — a clean, branded
 * HTML layout with the code shown prominently, a validity/one-time note, a
 * "don't share this" warning, and a plain-text fallback for clients that don't
 * render HTML. Table-based with fully inline styles so it survives email clients.
 */
export function buildOtpEmail(code: string, purpose: string): { subject: string; html: string; text: string } {
  const ttl = config.otp.ttlMinutes;
  const reason = purposeReason(purpose);
  const subject = `${APP_NAME}: your verification code is ${code}`;

  const text =
    `Please verify your identity.\n\n` +
    `Here is your ${APP_NAME} authentication code:\n\n` +
    `    ${code}\n\n` +
    `This code is valid for ${ttl} minutes and can only be used once.\n\n` +
    `Please don't share this code with anyone. We'll never ask for it by phone or email.\n\n` +
    `Thanks,\nThe ${APP_NAME} Team\n\n` +
    `You're receiving this email because a verification code was requested ${reason}. ` +
    `If this wasn't you, you can safely ignore this email.`;

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#f4f5f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f6;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e3e6e3;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="padding:22px 32px;border-bottom:1px solid #eceeec;">
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:700;color:#16a34a;">&gt;&nbsp;${APP_NAME}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <h1 style="margin:0 0 6px;font-size:19px;line-height:1.3;color:#1a1f1c;font-weight:600;">Please verify your identity</h1>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#5b635c;">Here is your ${APP_NAME} authentication code:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px 12px;">
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#15803d;">${code}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 32px 4px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#3a403b;">This code is valid for <strong>${ttl} minutes</strong> and can only be used once.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:6px 32px 20px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#8a5a00;background-color:#fff8e6;border:1px solid #ffe8a3;border-radius:8px;padding:10px 12px;">Please don't share this code with anyone. We'll never ask for it by phone or email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 26px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#3a403b;">Thanks,<br>The ${APP_NAME} Team</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background-color:#fafbfa;border-top:1px solid #eceeec;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#8b938c;">You're receiving this email because a verification code was requested ${reason}. If this wasn't you, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

/**
 * Sends real emails via Resend's HTTPS API. No-ops for mobile identifiers.
 * Using the HTTP API (rather than SMTP) sidesteps the IPv4/IPv6 outbound
 * issues that affect SMTP on Render.
 */
class EmailOtpSender implements OtpSender {
  private readonly resend = new Resend(config.email.apiKey);

  async send(identifier: string, code: string, purpose: string): Promise<void> {
    if (!EMAIL_PATTERN.test(identifier)) return;

    const { subject, html, text } = buildOtpEmail(code, purpose);
    const { error } = await this.resend.emails.send({
      from: `${APP_NAME} <${config.email.from}>`,
      to: identifier,
      subject,
      html,
      text,
    });

    if (error) {
      throw new Error(`Resend email request failed: ${error.message}`);
    }
  }
}

const MOBILE_PATTERN = /^\+91[6-9]\d{9}$/;

/**
 * Sends OTPs over WhatsApp via Twilio's free Sandbox (no business verification —
 * each recipient sends the sandbox join code to `config.whatsapp.from` once).
 * No-ops for email identifiers.
 */
class WhatsAppOtpSender implements OtpSender {
  async send(identifier: string, code: string, _purpose: string): Promise<void> {
    if (!MOBILE_PATTERN.test(identifier)) return;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.whatsapp.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: `whatsapp:${identifier}`,
      From: config.whatsapp.from,
      Body:
        `${APP_NAME}: your verification code is ${code}.\n` +
        `Valid for ${config.otp.ttlMinutes} minutes, one-time use. ` +
        `Please don't share it with anyone — we'll never ask for it. ` +
        `If you didn't request this, you can ignore this message.`,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.whatsapp.accountSid}:${config.whatsapp.authToken}`).toString("base64")}`,
      },
      body,
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`Twilio WhatsApp request failed (status ${response.status}): ${result?.message ?? "unknown error"}`);
    }
  }
}

class CompositeOtpSender implements OtpSender {
  constructor(private readonly senders: OtpSender[]) {}

  async send(identifier: string, code: string, purpose: string): Promise<void> {
    const results = await Promise.allSettled(this.senders.map((sender) => sender.send(identifier, code, purpose)));
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(`[otp:${purpose}] OTP sender failed for ${identifier}:`, result.reason);
      }
    }
  }
}

const senders: OtpSender[] = [new ConsoleOtpSender()];
if (config.email.enabled) senders.push(new EmailOtpSender());
if (config.whatsapp.enabled) senders.push(new WhatsAppOtpSender());

export const otpSender: OtpSender = senders.length > 1 ? new CompositeOtpSender(senders) : senders[0]!;
