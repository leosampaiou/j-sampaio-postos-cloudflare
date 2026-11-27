import { describe, expect, it } from "vitest";
import {
  isBeforeClosureSlot,
  matchesLatestReadingBaseline,
  parseReadingMilli,
  previousClosureShifts,
} from "./closureReadings";

describe("closure reading inputs", () => {
  it("keeps an explicit zero distinct from an empty input", () => {
    expect(parseReadingMilli("0")).toBe(0);
    expect(parseReadingMilli("")).toBeNull();
    expect(parseReadingMilli("   ")).toBeNull();
  });

  it("parses decimal readings to exact thousandths", () => {
    expect(parseReadingMilli("123.456")).toBe(123456);
    expect(parseReadingMilli("123,4")).toBe(123400);
  });

  it.each(["-1", "1.2345", "abc", "123456789012"])(
    "rejects invalid reading %s",
    value => expect(parseReadingMilli(value)).toBeNull()
  );
});

describe("previous closure slots", () => {
  it("returns only turns before the selected turn", () => {
    expect(previousClosureShifts("manha")).toEqual([]);
    expect(previousClosureShifts("tarde")).toEqual(["manha"]);
    expect(previousClosureShifts("noite")).toEqual(["manha", "tarde"]);
  });

  it("orders same-day shifts explicitly and excludes the same/later slot", () => {
    const target = { closureDate: "2026-11-27", shift: "noite" } as const;
    expect(
      isBeforeClosureSlot({ closureDate: "2026-11-27", shift: "tarde" }, target)
    ).toBe(true);
    expect(
      isBeforeClosureSlot({ closureDate: "2026-11-27", shift: "noite" }, target)
    ).toBe(false);
    expect(
      isBeforeClosureSlot(
        { closureDate: "2026-11-27", shift: "manha" },
        { closureDate: "2026-11-27", shift: "tarde" }
      )
    ).toBe(true);
  });

  it("treats every earlier calendar date as a previous slot", () => {
    expect(
      isBeforeClosureSlot(
        { closureDate: "2026-11-26", shift: "noite" },
        { closureDate: "2026-11-27", shift: "manha" }
      )
    ).toBe(true);
  });

  it("requires every saved nozzle reading to match its latest baseline", () => {
    const saved = [
      { pumpId: 1, initialReading: "123.450" },
      { pumpId: 2, initialReading: "0" },
    ];
    const current = [
      { pumpId: 1, finalReading: "123.45" },
      { pumpId: 2, finalReading: "0.000" },
    ];
    expect(matchesLatestReadingBaseline(saved, current)).toBe(true);
    expect(
      matchesLatestReadingBaseline(saved, [
        current[0],
        { ...current[1], finalReading: "1" },
      ])
    ).toBe(false);
    expect(matchesLatestReadingBaseline(saved, [current[0]])).toBe(false);
    expect(matchesLatestReadingBaseline([], current)).toBe(false);
  });
});
