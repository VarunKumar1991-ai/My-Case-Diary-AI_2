import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./errors.js";

describe("AppError hierarchy", () => {
  it.each([
    [ValidationError, 400, "VALIDATION_ERROR", "Validation failed"],
    [UnauthorizedError, 401, "UNAUTHORIZED", undefined],
    [ForbiddenError, 403, "FORBIDDEN", undefined],
    [NotFoundError, 404, "NOT_FOUND", undefined],
    [ConflictError, 409, "CONFLICT", "Already exists"],
    [TooManyRequestsError, 429, "TOO_MANY_REQUESTS", undefined],
  ] as const)("%s maps to status %i and code %s", (ErrorClass, statusCode, code, message) => {
    const error = message === undefined ? new ErrorClass() : new ErrorClass(message);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(statusCode);
    expect(error.code).toBe(code);
    expect(error.name).toBe(ErrorClass.name);
    if (message !== undefined) expect(error.message).toBe(message);
  });

  it("gives Unauthorized/Forbidden/NotFound sensible default messages", () => {
    expect(new UnauthorizedError().message).toMatch(/authentication/i);
    expect(new ForbiddenError().message).toMatch(/permission/i);
    expect(new NotFoundError().message).toMatch(/not found/i);
  });

  it("allows overriding the default message (used to keep auth failures generic)", () => {
    expect(new UnauthorizedError("Account is blocked").message).toBe("Account is blocked");
  });
});
