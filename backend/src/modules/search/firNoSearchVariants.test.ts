import { describe, expect, it, vi } from "vitest";

// The service module imports the db client at load time; stub it so this pure-logic
// test never touches a real connection.
vi.mock("../../db/client.js", () => ({ db: {} }));

const { firNoSearchVariants } = await import("./service.js");

describe("firNoSearchVariants", () => {
  it("treats a 2-digit year as its 21st-century 4-digit equivalent (196/25 ≡ 196/2025)", () => {
    expect(firNoSearchVariants("196/25")).toEqual(["196/25", "196/2025"]);
  });

  it("expands a 4-digit year to also match its 2-digit spelling (vice-versa)", () => {
    expect(firNoSearchVariants("196/2025")).toEqual(["196/25", "196/2025"]);
  });

  it("works for any FIR prefix and year", () => {
    expect(firNoSearchVariants("01/2026")).toEqual(["01/26", "01/2026"]);
    expect(firNoSearchVariants("7/05")).toEqual(["7/05", "7/2005"]);
  });

  it("tolerates surrounding and inner whitespace around the slash", () => {
    expect(firNoSearchVariants("  196 / 25 ")).toEqual(["196/25", "196/2025"]);
  });

  it("returns null for non-FIR queries (plain keyword search)", () => {
    expect(firNoSearchVariants("196")).toBeNull();
    expect(firNoSearchVariants("grievous hurt")).toBeNull();
    expect(firNoSearchVariants("196/2")).toBeNull();
    expect(firNoSearchVariants("196/12345")).toBeNull();
    expect(firNoSearchVariants("abc/25")).toBeNull();
  });
});
