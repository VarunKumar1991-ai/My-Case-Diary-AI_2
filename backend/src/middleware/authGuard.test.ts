import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../shared/errors.js";

const { selectMock, verifyAccessTokenMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  verifyAccessTokenMock: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  db: { select: selectMock },
}));

vi.mock("../shared/jwt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/jwt.js")>();
  return { ...actual, verifyAccessToken: verifyAccessTokenMock };
});

const { authGuard } = await import("./authGuard.js");
const { ACCESS_COOKIE } = await import("../shared/jwt.js");

interface UserRow {
  id: string;
  role: "OFFICER" | "ADMIN";
  accountStatus: "ACTIVE" | "BLOCKED";
  name: string;
  designation: string;
  email: string | null;
  mobile: string | null;
}

function mockUserLookup(row: UserRow | null) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(row ? [row] : []),
      }),
    }),
  });
}

function makeReq(cookieValue?: string): Request {
  return { cookies: cookieValue === undefined ? {} : { [ACCESS_COOKIE]: cookieValue } } as unknown as Request;
}

const ACTIVE_OFFICER: UserRow = {
  id: "UP00001",
  role: "OFFICER",
  accountStatus: "ACTIVE",
  name: "Active Officer",
  designation: "Sub Inspector",
  email: "officer@example.test",
  mobile: "+919876543210",
};

beforeEach(() => {
  selectMock.mockReset();
  verifyAccessTokenMock.mockReset();
});

describe("authGuard", () => {
  it("rejects a request with no access-token cookie", async () => {
    const req = makeReq(undefined);
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    await authGuard(req, {} as Response, next);

    expect(verifyAccessTokenMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(req.user).toBeUndefined();
  });

  it("rejects an invalid or expired token", async () => {
    verifyAccessTokenMock.mockImplementation(() => {
      throw new Error("jwt expired");
    });
    const req = makeReq("garbage-token");
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    await authGuard(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(req.user).toBeUndefined();
  });

  it("rejects a token for a user that no longer exists", async () => {
    verifyAccessTokenMock.mockReturnValue({ sub: "UP00001", role: "OFFICER" });
    mockUserLookup(null);
    const req = makeReq("valid-token");
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    await authGuard(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(req.user).toBeUndefined();
  });

  it("rejects a BLOCKED account immediately, even with a valid token (account-status gating)", async () => {
    verifyAccessTokenMock.mockReturnValue({ sub: "UP00002", role: "OFFICER" });
    mockUserLookup({ ...ACTIVE_OFFICER, id: "UP00002", accountStatus: "BLOCKED" });
    const req = makeReq("valid-token");
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    await authGuard(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(req.user).toBeUndefined();
  });

  it("attaches req.user and calls next() with no error for a valid, active session", async () => {
    verifyAccessTokenMock.mockReturnValue({ sub: ACTIVE_OFFICER.id, role: "OFFICER" });
    mockUserLookup(ACTIVE_OFFICER);
    const req = makeReq("valid-token");
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    await authGuard(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: ACTIVE_OFFICER.id,
      role: "OFFICER",
      accountStatus: "ACTIVE",
      name: ACTIVE_OFFICER.name,
      designation: ACTIVE_OFFICER.designation,
      email: ACTIVE_OFFICER.email,
      mobile: ACTIVE_OFFICER.mobile,
    });
  });

  it("never leaks the distinction between 'unknown user' and 'blocked account' to the caller", async () => {
    // Both paths must surface as the exact same UnauthorizedError shape —
    // enumeration-resistance applies at every layer, not just sign-in (§6.1).
    verifyAccessTokenMock.mockReturnValue({ sub: "UP00003", role: "OFFICER" });
    mockUserLookup(null);
    const unknownNext = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    await authGuard(makeReq("token-a"), {} as Response, unknownNext);

    verifyAccessTokenMock.mockReturnValue({ sub: "UP00004", role: "OFFICER" });
    mockUserLookup({ ...ACTIVE_OFFICER, id: "UP00004", accountStatus: "BLOCKED" });
    const blockedNext = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    await authGuard(makeReq("token-b"), {} as Response, blockedNext);

    const unknownError = unknownNext.mock.calls[0]?.[0] as UnauthorizedError;
    const blockedError = blockedNext.mock.calls[0]?.[0] as UnauthorizedError;
    expect(unknownError).toBeInstanceOf(UnauthorizedError);
    expect(blockedError).toBeInstanceOf(UnauthorizedError);
    expect(unknownError.message).toBe(blockedError.message);
    expect(unknownError.statusCode).toBe(blockedError.statusCode);
  });
});
