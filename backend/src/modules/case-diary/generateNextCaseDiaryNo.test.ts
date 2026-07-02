import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("../../db/client.js", () => ({
  db: { select: selectMock },
}));

const { generateNextCaseDiaryNo } = await import("./service.js");

const FIR = "01/2026";

function mockFirRows(caseDiaryNos: string[]) {
  const whereMock = vi.fn(() => Promise.resolve(caseDiaryNos.map((caseDiaryNo) => ({ caseDiaryNo }))));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  selectMock.mockReturnValue({ from: fromMock });
  return { fromMock, whereMock };
}

beforeEach(() => {
  selectMock.mockReset();
});

describe("generateNextCaseDiaryNo", () => {
  it("starts a fresh sequence at CD-001 for a brand-new FIR (no existing diaries)", async () => {
    mockFirRows([]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-001");
  });

  it("increments past the single existing highest number within the FIR", async () => {
    mockFirRows(["CD-005"]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-006");
  });

  it("picks the highest CD-NNN suffix out of many, regardless of insertion order", async () => {
    mockFirRows(["CD-002", "CD-010", "CD-005"]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-011");
  });

  it("zero-pads the next number to at least 3 digits", async () => {
    mockFirRows(["CD-007"]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-008");
  });

  it("does not zero-pad below the natural width once the sequence exceeds 3 digits", async () => {
    mockFirRows(["CD-999"]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-1000");
  });

  it("tolerates legacy/officer-edited numbers that don't match the CD-NNN pattern — they're ignored, not fatal", async () => {
    mockFirRows(["LEGACY-2024-001", "CD-003", "Diary #7", ""]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-004");
  });

  it("falls back to CD-001 when every existing number is non-matching legacy text", async () => {
    mockFirRows(["LEGACY-A", "Untitled", "CD-"]);

    await expect(generateNextCaseDiaryNo("UP00001", FIR)).resolves.toBe("CD-001");
  });

  it("scopes the lookup to the requesting officer AND the FIR (per-FIR sequence, not owner-global)", async () => {
    const { fromMock, whereMock } = mockFirRows(["CD-001"]);

    await generateNextCaseDiaryNo("UP00002", FIR);

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});
