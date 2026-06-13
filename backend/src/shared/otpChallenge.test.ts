import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooManyRequestsError, ValidationError } from "./errors.js";
import { config } from "../config/index.js";

const {
  selectMock,
  insertMock,
  updateMock,
  generateOtpCodeMock,
  hashOtpCodeMock,
  verifyOtpCodeMock,
  otpSenderSendMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  generateOtpCodeMock: vi.fn(),
  hashOtpCodeMock: vi.fn(),
  verifyOtpCodeMock: vi.fn(),
  otpSenderSendMock: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  db: { select: selectMock, insert: insertMock, update: updateMock },
}));

vi.mock("./otp.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./otp.js")>();
  return {
    ...actual,
    generateOtpCode: generateOtpCodeMock,
    hashOtpCode: hashOtpCodeMock,
    verifyOtpCode: verifyOtpCodeMock,
    otpSender: { send: otpSenderSendMock },
  };
});

const { issueOtpChallenge, consumeOtpChallenge } = await import("./otpChallenge.js");

async function expectValidationFailure(promise: Promise<unknown>, message: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ValidationError);
  await promise.catch((error: unknown) => {
    expect((error as ValidationError).message).toBe(message);
  });
}

interface ChallengeRow {
  id: string;
  identifier: string;
  hashedCode: string;
  purpose: "signup" | "signin" | "share-confirmation" | "visibility-change";
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

function baseChallenge(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  const now = Date.now();
  return {
    id: "otp_aaaa",
    identifier: "9876543210",
    hashedCode: "hashed-123456",
    purpose: "signin",
    createdAt: new Date(now - 5_000),
    expiresAt: new Date(now + 5 * 60_000),
    consumedAt: null,
    attempts: 0,
    ...overrides,
  };
}

function mockLatestChallenge(challenge: ChallengeRow | null) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(challenge ? [challenge] : []),
        }),
      }),
    }),
  });
}

function mockInsert() {
  const valuesMock = vi.fn((_values: Record<string, unknown>) => Promise.resolve(undefined));
  insertMock.mockReturnValue({ values: valuesMock });
  return valuesMock;
}

function mockUpdate() {
  const whereMock = vi.fn(() => Promise.resolve(undefined));
  const setMock = vi.fn((_values: Record<string, unknown>) => ({ where: whereMock }));
  updateMock.mockReturnValue({ set: setMock });
  return { setMock, whereMock };
}

beforeEach(() => {
  selectMock.mockReset();
  insertMock.mockReset();
  updateMock.mockReset();
  generateOtpCodeMock.mockReset();
  hashOtpCodeMock.mockReset();
  verifyOtpCodeMock.mockReset();
  otpSenderSendMock.mockReset();

  generateOtpCodeMock.mockReturnValue("123456");
  hashOtpCodeMock.mockResolvedValue("hashed-123456");
  otpSenderSendMock.mockResolvedValue(undefined);
});

describe("issueOtpChallenge", () => {
  it("issues a fresh code, persists it, and dispatches it via the sender when no recent challenge exists", async () => {
    mockLatestChallenge(null);
    const valuesMock = mockInsert();

    await issueOtpChallenge("9876543210", "signin");

    expect(generateOtpCodeMock).toHaveBeenCalledTimes(1);
    expect(hashOtpCodeMock).toHaveBeenCalledWith("123456");
    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(valuesMock.mock.calls[0]?.[0]).toMatchObject({
      identifier: "9876543210",
      hashedCode: "hashed-123456",
      purpose: "signin",
    });
    expect(otpSenderSendMock).toHaveBeenCalledWith("9876543210", "123456", "signin");
  });

  it("rejects a resend attempt while the cooldown window is still active", async () => {
    mockLatestChallenge(baseChallenge({ createdAt: new Date(Date.now() - 5_000), consumedAt: null }));
    mockInsert();

    await expect(issueOtpChallenge("9876543210", "signin")).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(insertMock).not.toHaveBeenCalled();
    expect(otpSenderSendMock).not.toHaveBeenCalled();
  });

  it("allows issuing a new code once the cooldown window has elapsed", async () => {
    mockLatestChallenge(baseChallenge({ createdAt: new Date(Date.now() - 90_000), consumedAt: null }));
    const valuesMock = mockInsert();

    await issueOtpChallenge("9876543210", "signin");

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(otpSenderSendMock).toHaveBeenCalledTimes(1);
  });

  it("allows issuing a new code immediately when the previous challenge was already consumed, regardless of recency", async () => {
    mockLatestChallenge(baseChallenge({ createdAt: new Date(Date.now() - 1_000), consumedAt: new Date() }));
    const valuesMock = mockInsert();

    await issueOtpChallenge("9876543210", "signin");

    expect(valuesMock).toHaveBeenCalledTimes(1);
    expect(otpSenderSendMock).toHaveBeenCalledTimes(1);
  });
});

describe("consumeOtpChallenge", () => {
  const FAILURE_MESSAGE = "Invalid or expired code";

  it("rejects when no challenge has ever been issued for this identifier/purpose", async () => {
    mockLatestChallenge(null);

    await expectValidationFailure(consumeOtpChallenge("9876543210", "signin", "123456", FAILURE_MESSAGE), FAILURE_MESSAGE);
  });

  it("rejects (with the same generic message) when the latest challenge was already consumed", async () => {
    mockLatestChallenge(baseChallenge({ consumedAt: new Date() }));

    await expectValidationFailure(consumeOtpChallenge("9876543210", "signin", "123456", FAILURE_MESSAGE), FAILURE_MESSAGE);
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it("rejects (with the same generic message) when the latest challenge has expired", async () => {
    mockLatestChallenge(baseChallenge({ expiresAt: new Date(Date.now() - 1_000) }));

    await expectValidationFailure(consumeOtpChallenge("9876543210", "signin", "123456", FAILURE_MESSAGE), FAILURE_MESSAGE);
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
  });

  it("locks out further attempts once the configured maximum has been reached", async () => {
    mockLatestChallenge(baseChallenge({ attempts: config.otp.maxAttempts }));

    await expect(consumeOtpChallenge("9876543210", "signin", "123456", FAILURE_MESSAGE)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    expect(verifyOtpCodeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("increments the attempt counter and rejects with the generic message on a wrong code", async () => {
    const challenge = baseChallenge({ attempts: 1 });
    mockLatestChallenge(challenge);
    const { setMock, whereMock } = mockUpdate();
    verifyOtpCodeMock.mockResolvedValue(false);

    await expectValidationFailure(consumeOtpChallenge("9876543210", "signin", "000000", FAILURE_MESSAGE), FAILURE_MESSAGE);

    expect(setMock).toHaveBeenCalledWith({ attempts: 2 });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("marks the challenge consumed and returns its id on a correct code", async () => {
    const challenge = baseChallenge({ attempts: 2 });
    mockLatestChallenge(challenge);
    const { setMock } = mockUpdate();
    verifyOtpCodeMock.mockResolvedValue(true);

    const result = await consumeOtpChallenge("9876543210", "signin", "123456", FAILURE_MESSAGE);

    expect(result).toEqual({ id: challenge.id });
    expect(setMock).toHaveBeenCalledTimes(1);
    const [setArg] = setMock.mock.calls[0] ?? [];
    expect(setArg?.consumedAt).toBeInstanceOf(Date);
  });

  it("never reveals whether the failure was 'no challenge', 'wrong code', or 'expired' — the caller-supplied message is always identical", async () => {
    mockLatestChallenge(null);
    const noChallengeResult = consumeOtpChallenge("a", "signin", "123456", FAILURE_MESSAGE);

    mockLatestChallenge(baseChallenge({ expiresAt: new Date(Date.now() - 1_000) }));
    const expiredResult = consumeOtpChallenge("b", "signin", "123456", FAILURE_MESSAGE);

    mockLatestChallenge(baseChallenge({ attempts: 0 }));
    mockUpdate();
    verifyOtpCodeMock.mockResolvedValue(false);
    const wrongCodeResult = consumeOtpChallenge("c", "signin", "000000", FAILURE_MESSAGE);

    const [a, b, c] = await Promise.allSettled([noChallengeResult, expiredResult, wrongCodeResult]);
    for (const settled of [a, b, c]) {
      expect(settled.status).toBe("rejected");
      if (settled.status === "rejected") {
        expect(settled.reason).toBeInstanceOf(ValidationError);
        expect((settled.reason as ValidationError).message).toBe(FAILURE_MESSAGE);
      }
    }
  });
});
