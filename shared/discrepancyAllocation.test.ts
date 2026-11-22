import { describe, expect, it } from "vitest";
import { allocateCentsByShare } from "./discrepancyAllocation";

describe("discrepancy cent allocation", () => {
  it("preserves total cents and uses deterministic largest-remainder rounding", () => {
    expect(
      allocateCentsByShare(5, [
        { employeeId: 12, sharePercent: 50 },
        { employeeId: 4, sharePercent: 50 },
      ])
    ).toEqual([
      { employeeId: 12, sharePercent: 50, allocatedCents: 2 },
      { employeeId: 4, sharePercent: 50, allocatedCents: 3 },
    ]);
  });

  it("never creates negative allocations when the total is smaller than participant count", () => {
    const participants = Array.from({ length: 100 }, (_, index) => ({
      employeeId: index + 1,
      sharePercent: 1,
    }));
    const allocations = allocateCentsByShare(1, participants);
    expect(allocations.reduce((sum, row) => sum + row.allocatedCents, 0)).toBe(
      1
    );
    expect(allocations.every(row => row.allocatedCents >= 0)).toBe(true);
    expect(
      allocations
        .filter(row => row.allocatedCents === 1)
        .map(row => row.employeeId)
    ).toEqual([1]);
  });

  it("rejects shares that do not explicitly total 100 percent", () => {
    expect(() =>
      allocateCentsByShare(100, [
        { employeeId: 1, sharePercent: 60 },
        { employeeId: 2, sharePercent: 30 },
      ])
    ).toThrow(/total 100/);
  });
});
