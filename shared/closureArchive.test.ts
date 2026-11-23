import { describe, expect, it } from "vitest";
import { isClosureArchivable } from "./closureArchive";

const eligibleDraft = {
  status: "rascunho",
  finalizedAt: null,
  reopenedAt: null,
  hasStockMovement: false,
  hasDiscrepancyCase: false,
} as const;

describe("closure archive eligibility", () => {
  it("accepts only an untouched draft with no stock or discrepancy references", () => {
    expect(isClosureArchivable(eligibleDraft)).toBe(true);
  });

  it.each([
    { status: "finalizado" },
    { status: "reaberto" },
    { finalizedAt: new Date("2026-11-20T17:00:00.000Z") },
    { reopenedAt: new Date("2026-11-20T17:00:00.000Z") },
    { hasStockMovement: true },
    { hasDiscrepancyCase: true },
  ])("rejects ineligible or financially linked records: %o", overrides => {
    expect(isClosureArchivable({ ...eligibleDraft, ...overrides })).toBe(false);
  });
});
