import { describe, expect, it } from "vitest";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "./jwt.js";

describe("access tokens", () => {
  it("round-trips the signed payload", () => {
    const token = signAccessToken({ sub: "UP12345", role: "OFFICER" });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe("UP12345");
    expect(payload.role).toBe("OFFICER");
  });

  it("rejects a token signed with a different secret", () => {
    // jsonwebtoken signs with config.jwt.accessSecret; tampering with the
    // signature (or using the refresh verifier, which uses a different
    // secret) must be rejected, never silently accepted.
    const token = signAccessToken({ sub: "UP12345", role: "ADMIN" });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => verifyAccessToken("not-a-jwt")).toThrow();
  });
});

describe("refresh tokens", () => {
  it("round-trips the signed payload", () => {
    const token = signRefreshToken({ sub: "UP12345", tokenId: "rt_abc123" });
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe("UP12345");
    expect(payload.tokenId).toBe("rt_abc123");
  });

  it("uses a different signing key than access tokens (cross-verification fails)", () => {
    const accessToken = signAccessToken({ sub: "UP12345", role: "OFFICER" });
    const refreshToken = signRefreshToken({ sub: "UP12345", tokenId: "rt_abc123" });

    expect(() => verifyRefreshToken(accessToken)).toThrow();
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});

describe("cookie name constants", () => {
  it("are distinct, stable identifiers", () => {
    expect(ACCESS_COOKIE).toBe("cd_access_token");
    expect(REFRESH_COOKIE).toBe("cd_refresh_token");
    expect(ACCESS_COOKIE).not.toBe(REFRESH_COOKIE);
  });
});
