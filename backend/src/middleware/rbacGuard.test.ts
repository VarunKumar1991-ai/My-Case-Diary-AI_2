import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireRole } from "./rbacGuard.js";
import { ForbiddenError, UnauthorizedError } from "../shared/errors.js";
import type { AuthenticatedUser } from "./authGuard.js";

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "UP00001",
    role: "OFFICER",
    accountStatus: "ACTIVE",
    name: "Test Officer",
    designation: "Sub Inspector",
    email: "officer@example.test",
    mobile: "+919876543210",
    ...overrides,
  };
}

describe("requireRole", () => {
  it("calls next() with no error when the user holds an allowed role", () => {
    const guard = requireRole("ADMIN");
    const req = { user: makeUser({ role: "ADMIN" }) } as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    guard(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next() with no error when one of several allowed roles matches", () => {
    const guard = requireRole("OFFICER", "ADMIN");
    const req = { user: makeUser({ role: "OFFICER" }) } as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    guard(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a cross-role access attempt with 403 Forbidden — never leaking data", () => {
    const guard = requireRole("ADMIN");
    const req = { user: makeUser({ role: "OFFICER" }) } as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    guard(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0] as [unknown];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).statusCode).toBe(403);
  });

  it("rejects an unauthenticated request with 401 Unauthorized rather than 403", () => {
    const guard = requireRole("ADMIN");
    const req = {} as Request;
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

    guard(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const [error] = next.mock.calls[0] as [unknown];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as UnauthorizedError).statusCode).toBe(401);
  });
});
