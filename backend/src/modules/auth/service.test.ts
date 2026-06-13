import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "../../shared/errors.js";

const {
  selectMock,
  insertMock,
  issueOtpChallengeMock,
  consumeOtpChallengeMock,
  recordAuditEntryMock,
  signAccessTokenMock,
  signRefreshTokenMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  issueOtpChallengeMock: vi.fn(),
  consumeOtpChallengeMock: vi.fn(),
  recordAuditEntryMock: vi.fn(),
  signAccessTokenMock: vi.fn(),
  signRefreshTokenMock: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  db: { select: selectMock, insert: insertMock },
}));

vi.mock("../../shared/otpChallenge.js", () => ({
  issueOtpChallenge: issueOtpChallengeMock,
  consumeOtpChallenge: consumeOtpChallengeMock,
}));

vi.mock("../audit/service.js", () => ({
  recordAuditEntry: recordAuditEntryMock,
}));

vi.mock("../../shared/jwt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/jwt.js")>();
  return { ...actual, signAccessToken: signAccessTokenMock, signRefreshToken: signRefreshTokenMock };
});

const { requestSignupOtp, verifySignupOtp, requestSigninOtp, verifySigninOtp, recordLogout } = await import(
  "./service.js"
);

const GENERIC_OTP_FAILURE = "The code is incorrect or has expired. Please request a new one.";

interface UserRow {
  id: string;
  name: string;
  designation: string;
  email: string | null;
  mobile: string | null;
  role: "OFFICER" | "ADMIN";
  accountStatus: "ACTIVE" | "BLOCKED";
}

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "UP00001",
    name: "Active Officer",
    designation: "Sub Inspector",
    email: "officer@example.test",
    mobile: "+919876543210",
    role: "OFFICER",
    accountStatus: "ACTIVE",
    ...overrides,
  };
}

const CONTEXT = { ip: "127.0.0.1", userAgent: "vitest" };

/** Each call to `db.select()...limit()` resolves with the next queued row-set, in order. */
function queueSelectResults(...rowSets: UserRow[][]) {
  let call = 0;
  selectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rowSets[call++] ?? []),
      }),
    }),
  }));
}

function mockInsertReturning(row: UserRow | null) {
  insertMock.mockReturnValue({
    values: () => ({
      returning: () => Promise.resolve(row ? [row] : []),
    }),
  });
}

beforeEach(() => {
  selectMock.mockReset();
  insertMock.mockReset();
  issueOtpChallengeMock.mockReset();
  consumeOtpChallengeMock.mockReset();
  recordAuditEntryMock.mockReset();
  signAccessTokenMock.mockReset();
  signRefreshTokenMock.mockReset();

  issueOtpChallengeMock.mockResolvedValue(undefined);
  consumeOtpChallengeMock.mockResolvedValue({ id: "otp_x" });
  recordAuditEntryMock.mockResolvedValue(undefined);
  signAccessTokenMock.mockReturnValue("access.jwt.token");
  signRefreshTokenMock.mockReturnValue("refresh.jwt.token");
});

describe("requestSignupOtp", () => {
  const input = { pno: "UP00099", name: "New Officer", mobile: "9876500000" };

  it("issues an OTP and audits the request when the PNO and contact are both available", async () => {
    queueSelectResults([], []);

    await requestSignupOtp(input, CONTEXT);

    expect(issueOtpChallengeMock).toHaveBeenCalledWith("+919876500000", "signup");
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signup.otp_requested", resourceId: "UP00099" }),
    );
  });

  it("rejects with ConflictError when the PNO is already registered — and never issues a code", async () => {
    queueSelectResults([userRow({ id: "UP00099" })]);

    await expect(requestSignupOtp(input, CONTEXT)).rejects.toBeInstanceOf(ConflictError);
    expect(issueOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects with ConflictError when the email/mobile is already registered under a different PNO", async () => {
    queueSelectResults([], [userRow({ id: "UP00050", mobile: "+919876500000" })]);

    await expect(requestSignupOtp(input, CONTEXT)).rejects.toBeInstanceOf(ConflictError);
    expect(issueOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects with ValidationError for a malformed Indian mobile number before touching the database", async () => {
    await expect(
      requestSignupOtp({ ...input, mobile: "12345" }, CONTEXT),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(selectMock).not.toHaveBeenCalled();
    expect(issueOtpChallengeMock).not.toHaveBeenCalled();
  });
});

describe("verifySignupOtp", () => {
  const input = {
    pno: "UP00099",
    name: "New Officer",
    mobile: "9876500000",
    code: "123456",
  };

  it("creates the account, issues a session, and audits completion on a correct code", async () => {
    queueSelectResults([], []);
    mockInsertReturning(userRow({ id: "UP00099", mobile: "+919876500000" }));

    const session = await verifySignupOtp(input, CONTEXT);

    expect(consumeOtpChallengeMock).toHaveBeenCalledWith("+919876500000", "signup", "123456", GENERIC_OTP_FAILURE);
    expect(session).toEqual({
      user: expect.objectContaining({ id: "UP00099", role: "OFFICER", accountStatus: "ACTIVE" }),
      accessToken: "access.jwt.token",
      refreshToken: "refresh.jwt.token",
    });
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signup.completed" }),
    );
  });

  it("never creates an account when the OTP is wrong or expired — the generic failure propagates as-is", async () => {
    consumeOtpChallengeMock.mockRejectedValue(new ValidationError(GENERIC_OTP_FAILURE));

    await expect(verifySignupOtp(input, CONTEXT)).rejects.toMatchObject({ message: GENERIC_OTP_FAILURE });
    expect(insertMock).not.toHaveBeenCalled();
    expect(signAccessTokenMock).not.toHaveBeenCalled();
  });

  it("re-checks identifier availability at verification time, closing the signup race window", async () => {
    // Someone else grabbed the PNO between the OTP request and this verification.
    queueSelectResults([userRow({ id: "UP00099" })]);

    await expect(verifySignupOtp(input, CONTEXT)).rejects.toBeInstanceOf(ConflictError);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("requestSigninOtp — enumeration resistance", () => {
  const input = { mobile: "9876543210" };

  it("issues an OTP and audits 'otp_requested' for a known ACTIVE account", async () => {
    queueSelectResults([userRow({ accountStatus: "ACTIVE" })]);

    await requestSigninOtp(input, CONTEXT);

    expect(issueOtpChallengeMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signin.otp_requested" }),
    );
  });

  it("does not issue an OTP for an unknown account, yet completes identically (no thrown error)", async () => {
    queueSelectResults([]);

    await expect(requestSigninOtp(input, CONTEXT)).resolves.toBeUndefined();
    expect(issueOtpChallengeMock).not.toHaveBeenCalled();
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signin.otp_requested_unknown_or_blocked", actorId: null }),
    );
  });

  it("does not issue an OTP for a BLOCKED account either — same outward behaviour as 'unknown'", async () => {
    queueSelectResults([userRow({ accountStatus: "BLOCKED" })]);

    await expect(requestSigninOtp(input, CONTEXT)).resolves.toBeUndefined();
    expect(issueOtpChallengeMock).not.toHaveBeenCalled();
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signin.otp_requested_unknown_or_blocked" }),
    );
  });
});

describe("verifySigninOtp", () => {
  const input = { mobile: "9876543210", code: "123456" };

  it("returns a session for a correct code against a known ACTIVE account", async () => {
    queueSelectResults([userRow({ accountStatus: "ACTIVE" })]);

    const session = await verifySigninOtp(input, CONTEXT);

    expect(session.accessToken).toBe("access.jwt.token");
    expect(session.refreshToken).toBe("refresh.jwt.token");
    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signin.completed" }),
    );
  });

  it("rejects an unknown account with the generic failure — without ever attempting to consume a code", async () => {
    queueSelectResults([]);

    await expect(verifySigninOtp(input, CONTEXT)).rejects.toMatchObject({ message: GENERIC_OTP_FAILURE });
    expect(consumeOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects a BLOCKED account with the exact same generic failure — never distinguishing it from 'unknown'", async () => {
    queueSelectResults([userRow({ accountStatus: "BLOCKED" })]);

    await expect(verifySigninOtp(input, CONTEXT)).rejects.toMatchObject({ message: GENERIC_OTP_FAILURE });
    expect(consumeOtpChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong code for a known ACTIVE account with the same generic failure", async () => {
    queueSelectResults([userRow({ accountStatus: "ACTIVE" })]);
    consumeOtpChallengeMock.mockRejectedValue(new ValidationError(GENERIC_OTP_FAILURE));

    await expect(verifySigninOtp(input, CONTEXT)).rejects.toMatchObject({ message: GENERIC_OTP_FAILURE });
    expect(signAccessTokenMock).not.toHaveBeenCalled();
  });
});

describe("recordLogout", () => {
  it("records an audit entry for the logout", async () => {
    await recordLogout("UP00001", CONTEXT);

    expect(recordAuditEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "UP00001", action: "auth.logout", resourceId: "UP00001" }),
    );
  });
});
