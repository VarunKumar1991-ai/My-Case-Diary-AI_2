import { describe, expect, it } from "vitest";
import { normalizeIndianMobile } from "./mobile.js";

describe("normalizeIndianMobile", () => {
  it("accepts a bare 10-digit national number starting with 6-9", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("+919876543210");
    expect(normalizeIndianMobile("6000000000")).toBe("+916000000000");
  });

  it("accepts and normalizes E.164 (+91...) input", () => {
    expect(normalizeIndianMobile("+919876543210")).toBe("+919876543210");
  });

  it("accepts and normalizes a 12-digit number with the 91 country-code prefix", () => {
    expect(normalizeIndianMobile("919876543210")).toBe("+919876543210");
  });

  it("accepts and normalizes an 11-digit number with a leading trunk 0", () => {
    expect(normalizeIndianMobile("09876543210")).toBe("+919876543210");
  });

  it("strips spaces and hyphens before validating", () => {
    expect(normalizeIndianMobile("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianMobile("98765-43210")).toBe("+919876543210");
  });

  it("rejects numbers that don't start with 6-9", () => {
    expect(normalizeIndianMobile("5876543210")).toBeNull();
    expect(normalizeIndianMobile("0876543210")).toBeNull();
  });

  it("rejects numbers with the wrong length", () => {
    expect(normalizeIndianMobile("987654321")).toBeNull();
    expect(normalizeIndianMobile("98765432101")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(normalizeIndianMobile("98765abcde")).toBeNull();
    expect(normalizeIndianMobile("")).toBeNull();
  });

  it("never silently truncates or corrects an out-of-shape input", () => {
    // A 12-digit string that doesn't start with the 91 country code must be rejected outright.
    expect(normalizeIndianMobile("929876543210")).toBeNull();
  });
});
