import { describe, expect, it } from "vitest";
import {
  MINIMUM_AUTONOMY_SAMPLE_DAYS,
  autonomyInDays,
  calendarDaysInclusive,
  classifyStockHealth,
  summarizeTankSalesWindow,
  suggestedReplenishmentLiters,
  type TankSalesRecord,
} from "./inventory";

const shifts = ["manha", "noite"] as const;
const assignment = (pumpId: number, tankId: number, effectiveAt: string) => ({
  pumpId,
  tankId,
  effectiveAt,
});

function completeDay(
  date: string,
  firstClosureId: number,
  litersByShift: readonly [number, number],
  options: {
    pumpId?: number;
    fuelType?: string;
    otherPumpLiters?: number;
    otherPumpFuelType?: string;
  } = {}
): TankSalesRecord[] {
  const pumpId = options.pumpId ?? 1;
  const fuelType = options.fuelType ?? "gasolina_comum";
  return shifts.flatMap((shift, index) => {
    const finalizedAt = new Date(
      `${date}T${shift === "manha" ? "16:00:00" : "01:00:00"}.000Z`
    );
    if (shift === "noite") finalizedAt.setUTCDate(finalizedAt.getUTCDate() + 1);
    const rows: TankSalesRecord[] = [
      {
        closureId: firstClosureId + index,
        pumpId,
        fuelType,
        closureDate: date,
        shift,
        finalizedAt,
        liters: litersByShift[index],
      },
    ];
    if (options.otherPumpLiters !== undefined)
      rows.push({
        closureId: firstClosureId + index,
        pumpId: 2,
        fuelType: options.otherPumpFuelType ?? fuelType,
        closureDate: date,
        shift,
        finalizedAt,
        liters: options.otherPumpLiters,
      });
    return rows;
  });
}

describe("inventory estimates", () => {
  it("uses three complete days as the threshold for adequate sample quality", () => {
    expect(MINIMUM_AUTONOMY_SAMPLE_DAYS).toBe(3);
  });

  it("does not invent autonomy when daily average is zero", () => {
    expect(autonomyInDays(8500, 0)).toBeNull();
  });

  it("counts calendar days in a valid range", () => {
    expect(calendarDaysInclusive("2026-11-15", "2026-11-21")).toBe(7);
    expect(calendarDaysInclusive("2026-11-20", "2026-11-21")).toBe(2);
    expect(calendarDaysInclusive("2026-11-22", "2026-11-21")).toBe(0);
    expect(calendarDaysInclusive("invalid", "2026-11-21")).toBe(0);
  });

  it("averages the correct fuel and currently assigned pump only on complete days", () => {
    const sales = [
      ...completeDay("2026-11-19", 1, [30, 30], { otherPumpLiters: 900 }),
      ...completeDay("2026-11-20", 4, [40, 40], { otherPumpLiters: 900 }),
      ...completeDay("2026-11-21", 7, [30, 30], {
        otherPumpLiters: 700,
        otherPumpFuelType: "diesel_s10",
      }),
    ];
    const summary = summarizeTankSalesWindow(
      sales,
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-15",
      "2026-11-21",
      "2026-11-19"
    );

    expect(summary.availableDays).toBe(3);
    expect(summary.records).toBe(6);
    expect(summary.totalLiters).toBe(200);
    expect(summary.averageDailyLiters).toBeCloseTo(200 / 3);
    expect(autonomyInDays(900, summary.averageDailyLiters)).toBeCloseTo(13.5);
  });

  it("excludes an incomplete date instead of treating missing shifts as zero sales", () => {
    const incomplete = completeDay("2026-11-19", 1, [100, 100]).filter(
      row => row.shift !== "noite"
    );
    const summary = summarizeTankSalesWindow(
      [...incomplete, ...completeDay("2026-11-20", 4, [30, 30])],
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-20",
      "2026-11-19",
      1
    );

    expect(summary.coveredDays).toBe(1);
    expect(summary.totalLiters).toBe(60);
    expect(summary.averageDailyLiters).toBe(60);
  });

  it("excludes a date with a duplicated shift", () => {
    const duplicatedShift = completeDay("2026-11-19", 1, [30, 30]).map(
      (row, index) => (index === 1 ? { ...row, shift: "manha" } : row)
    );
    const summary = summarizeTankSalesWindow(
      duplicatedShift,
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-19",
      "2026-11-19",
      1
    );

    expect(summary.coveredDays).toBe(0);
    expect(summary.averageDailyLiters).toBe(0);
  });

  it("ignores afternoon sales instead of counting them in the autonomy sample", () => {
    const twoClosures = completeDay("2026-11-19", 1, [30, 40]);
    const afternoonClosure = {
      ...twoClosures[0],
      closureId: 3,
      shift: "tarde",
      finalizedAt: new Date("2026-11-19T19:00:00.000Z"),
      liters: 900,
    };
    const summary = summarizeTankSalesWindow(
      [...twoClosures, afternoonClosure],
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-19",
      "2026-11-19",
      1
    );

    expect(summary.coveredDays).toBe(1);
    expect(summary.records).toBe(2);
    expect(summary.totalLiters).toBe(70);
  });

  it("does not reassign historical sales when a pump moves to another tank", () => {
    const history = [
      assignment(1, 10, "2026-11-01T00:00:00.000Z"),
      assignment(1, 20, "2026-11-20T12:00:00.000Z"),
      assignment(1, 10, "2026-11-21T23:00:00.000Z"),
    ];
    const sales = [
      ...completeDay("2026-11-19", 1, [20, 20]),
      ...completeDay("2026-11-20", 4, [20, 500]),
      ...completeDay("2026-11-21", 7, [500, 500]),
    ];
    const summary = summarizeTankSalesWindow(
      sales,
      [1],
      history,
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-21",
      "2026-11-19",
      1
    );

    expect(summary.coveredDays).toBe(1);
    expect(summary.totalLiters).toBe(40);
    expect(summary.averageDailyLiters).toBe(40);
  });

  it("counts recorded zero-sales days but does not divide by zero", () => {
    const sales = [
      ...completeDay("2026-11-19", 1, [0, 0]),
      ...completeDay("2026-11-20", 4, [0, 0]),
      ...completeDay("2026-11-21", 7, [0, 0]),
    ];
    const summary = summarizeTankSalesWindow(
      sales,
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-21",
      "2026-11-19"
    );

    expect(summary.coveredDays).toBe(3);
    expect(summary.averageDailyLiters).toBe(0);
    expect(autonomyInDays(1000, summary.averageDailyLiters)).toBeNull();
  });

  it("estimates from fewer than three complete days and marks the sample as low confidence", () => {
    const summary = summarizeTankSalesWindow(
      [
        ...completeDay("2026-11-20", 1, [50, 50]),
        ...completeDay("2026-11-21", 3, [50, 50]),
      ],
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-15",
      "2026-11-21",
      "2026-11-20"
    );

    expect(summary.coveredDays).toBe(2);
    expect(summary.averageDailyLiters).toBe(100);
    expect(summary.minimumSampleReached).toBe(false);
    expect(autonomyInDays(8500, summary.averageDailyLiters)).toBe(85);
  });

  it("does not invent an average before the tank stock start date", () => {
    const summary = summarizeTankSalesWindow(
      completeDay("2026-11-21", 1, [100, 100]),
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-15",
      "2026-11-21",
      "2026-11-22"
    );
    expect(summary.availableDays).toBe(0);
    expect(summary.records).toBe(0);
    expect(summary.averageDailyLiters).toBe(0);
  });

  it("does not treat the wrong fuel as tank sales", () => {
    const summary = summarizeTankSalesWindow(
      completeDay("2026-11-19", 1, [100, 100], {
        fuelType: "diesel_s10",
      }),
      [1],
      [assignment(1, 10, "2026-11-01T00:00:00.000Z")],
      10,
      "gasolina_comum",
      "2026-11-19",
      "2026-11-19",
      "2026-11-19",
      1
    );
    expect(summary.coveredDays).toBe(0);
    expect(summary.averageDailyLiters).toBe(0);
  });

  it("calculates fractional autonomy from available stock and real average", () => {
    expect(autonomyInDays(8500, 1500)).toBeCloseTo(5.6667, 3);
  });

  it("caps replenishment at operational capacity", () => {
    expect(
      suggestedReplenishmentLiters({
        stockLiters: 900,
        operationalCapacityLiters: 1000,
        minimumLiters: 300,
        averageDailyLiters: 200,
        leadDays: 4,
        safetyReserveLiters: 200,
      })
    ).toBe(100);
  });

  it("returns no replenishment while stock is above the reorder point", () => {
    expect(
      suggestedReplenishmentLiters({
        stockLiters: 950,
        operationalCapacityLiters: 1000,
        minimumLiters: 300,
        averageDailyLiters: 100,
        leadDays: 2,
        safetyReserveLiters: 100,
      })
    ).toBe(0);
  });

  it("marks critical stock and physical divergence distinctly", () => {
    expect(
      classifyStockHealth({
        stockLiters: 100,
        minimumLiters: 120,
        nearMinimumPercent: 15,
        autonomyDays: 5,
        warningAutonomyDays: 3,
        criticalAutonomyDays: 2,
        stale: false,
        discrepancyPercent: null,
        discrepancyAlertPercent: 2,
      })
    ).toBe("critico");
    expect(
      classifyStockHealth({
        stockLiters: 500,
        minimumLiters: 120,
        nearMinimumPercent: 15,
        autonomyDays: 5,
        warningAutonomyDays: 3,
        criticalAutonomyDays: 2,
        stale: false,
        discrepancyPercent: 2.5,
        discrepancyAlertPercent: 2,
      })
    ).toBe("critico");
    expect(
      classifyStockHealth({
        stockLiters: 500,
        minimumLiters: 120,
        nearMinimumPercent: 15,
        autonomyDays: 2.5,
        warningAutonomyDays: 3,
        criticalAutonomyDays: 2,
        stale: true,
        discrepancyPercent: null,
        discrepancyAlertPercent: 2,
      })
    ).toBe("atencao");
  });
});
