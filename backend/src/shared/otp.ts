import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
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

// Render's network can't route outbound IPv6, but Gmail's SMTP host resolves
// to an IPv6 address by default — force IPv4 (same ENETUNREACH class of issue
// as the Supabase DATABASE_URL fix). `family` isn't in nodemailer's typing for
// SMTPTransport.Options, so it's kept on a separate const to avoid the
// resulting excess-property check picking the wrong createTransport overload.
const emailTransportOptions = {
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: { user: config.email.user, pass: config.email.pass },
  family: 4,
};

/** Sends real emails via SMTP (Gmail App Password). No-ops for mobile identifiers. */
class EmailOtpSender implements OtpSender {
  private transporter = nodemailer.createTransport(emailTransportOptions);

  async send(identifier: string, code: string, purpose: string): Promise<void> {
    if (!EMAIL_PATTERN.test(identifier)) return;

    await this.transporter.sendMail({
      from: `"My Case Diary AI" <${config.email.from}>`,
      to: identifier,
      subject: "Your My Case Diary AI verification code",
      text: `Your verification code is ${code}. It expires in ${config.otp.ttlMinutes} minutes. If you did not request this, you can ignore this email.`,
    });
  }
}

const MOBILE_PATTERN = /^\+91[6-9]\d{9}$/;

/**
 * Sends OTPs over WhatsApp via Twilio's free Sandbox (no business verification —
 * each recipient sends the sandbox join code to `config.whatsapp.from` once).
 * No-ops for email identifiers.
 */
class WhatsAppOtpSender implements OtpSender {
  async send(identifier: string, code: string, purpose: string): Promise<void> {
    if (!MOBILE_PATTERN.test(identifier)) return;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.whatsapp.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: `whatsapp:${identifier}`,
      From: config.whatsapp.from,
      Body: `Your My Case Diary AI verification code is ${code}. It expires in ${config.otp.ttlMinutes} minutes. If you did not request this, you can ignore this message.`,
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
