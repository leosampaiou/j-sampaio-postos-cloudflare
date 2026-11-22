import { describe, expect, it } from "vitest";
import {
  businessDateInSaoPaulo,
  isValidCalendarDate,
  lastDayOfMonth,
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

  it("finds the final calendar day of the month, including leap years", () => {
    expect(lastDayOfMonth("2026-11-22")).toBe("2026-11-30");
    expect(lastDayOfMonth("2024-02-15")).toBe("2024-02-29");
    expect(lastDayOfMonth("2026-02-15")).toBe("2026-02-28");
    expect(() => lastDayOfMonth("2026-02-31")).toThrow(RangeError);
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
