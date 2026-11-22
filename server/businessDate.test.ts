import { describe, expect, it } from "vitest";
import {
  businessDateInSaoPaulo,
  isValidCalendarDate,
  shiftCalendarDate,
} from "../shared/businessDate";

describe("business calendar dates", () => {
  it("uses the São Paulo date before UTC midnight", () => {
    expect(businessDateInSaoPaulo(new Date("2026-12-01T01:30:00.000Z"))).toBe(
      "2026-11-30"
    );
  });

  it("shifts calendar days across month boundaries", () => {
    expect(shiftCalendarDate("2026-12-01", -1)).toBe("2026-11-30");
    expect(shiftCalendarDate("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-02-31")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("26-02-01")).toBe(false);
    expect(() => shiftCalendarDate("2026-02-31", 1)).toThrow(RangeError);
  });
});
