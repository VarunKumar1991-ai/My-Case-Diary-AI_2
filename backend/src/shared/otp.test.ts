import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtpCode, verifyOtpCode } from "./otp.js";

describe("generateOtpCode", () => {
  it("always produces a 6-digit zero-padded numeric string", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(Number.parseInt(code, 10)).toBeGreaterThanOrEqual(0);
      expect(Number.parseInt(code, 10)).toBeLessThan(1_000_000);
    }
  });
});

describe("hashOtpCode / verifyOtpCode", () => {
  it("verifies a code against its own hash", async () => {
    const hashed = await hashOtpCode("123456");
    await expect(verifyOtpCode("123456", hashed)).resolves.toBe(true);
  });

  it("rejects an incorrect code", async () => {
    const hashed = await hashOtpCode("123456");
    await expect(verifyOtpCode("654321", hashed)).resolves.toBe(false);
  });

  it("produces a salted hash that differs across calls for the same code", async () => {
    const first = await hashOtpCode("123456");
    const second = await hashOtpCode("123456");

    expect(first).not.toBe(second);
    await expect(verifyOtpCode("123456", first)).resolves.toBe(true);
    await expect(verifyOtpCode("123456", second)).resolves.toBe(true);
  });

  it("never stores the raw code inside the hash", async () => {
    const hashed = await hashOtpCode("123456");
    expect(hashed).not.toContain("123456");
  });
});
