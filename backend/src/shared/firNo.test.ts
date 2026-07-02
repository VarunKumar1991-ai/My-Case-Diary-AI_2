import { describe, expect, it } from "vitest";

import { normalizeFirNo } from "./firNo.js";

describe("normalizeFirNo", () => {
  it("expands a 2-digit year to its 21st-century 4-digit form", () => {
    expect(normalizeFirNo("196/25")).toBe("196/2025");
    expect(normalizeFirNo("120/26")).toBe("120/2026");
    expect(normalizeFirNo("7/05")).toBe("7/2005");
  });

  it("leaves an already-canonical 4-digit year unchanged", () => {
    expect(normalizeFirNo("196/2025")).toBe("196/2025");
    expect(normalizeFirNo("01/2026")).toBe("01/2026");
  });

  it("strips whitespace around the value and the slash", () => {
    expect(normalizeFirNo("  196 / 25 ")).toBe("196/2025");
    expect(normalizeFirNo("196/ 2025")).toBe("196/2025");
  });

  it("returns non-FIR-pattern values trimmed but otherwise untouched", () => {
    expect(normalizeFirNo("FIR-2026-0042")).toBe("FIR-2026-0042");
    expect(normalizeFirNo("  196  ")).toBe("196");
    expect(normalizeFirNo("196/2")).toBe("196/2");
    expect(normalizeFirNo("196/12345")).toBe("196/12345");
  });
});
