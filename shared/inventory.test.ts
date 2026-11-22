import { describe, expect, it } from "vitest";
import {
  autonomyInDays,
  calendarDaysInclusive,
  classifyStockHealth,
  summarizeTankSalesWindow,
  suggestedReplenishmentLiters,
} from "./inventory";

describe("inventory estimates", () => {
  it("does not invent autonomy when daily average is zero", () => {
    expect(autonomyInDays(8500, 0)).toBeNull();
  });

  it("counts only calendar days with an available tank history", () => {
    expect(calendarDaysInclusive("2026-11-15", "2026-11-21")).toBe(7);
    expect(calendarDaysInclusive("2026-11-20", "2026-11-21")).toBe(2);
    expect(calendarDaysInclusive("2026-11-22", "2026-11-21")).toBe(0);
    expect(calendarDaysInclusive("invalid", "2026-11-21")).toBe(0);
  });

  it("averages only sales from assigned pumps over the available days", () => {
    const summary = summarizeTankSalesWindow(
      [
        { pumpId: 1, closureDate: "2026-11-19", liters: 100 },
        { pumpId: 1, closureDate: "2026-11-21", liters: 50 },
        { pumpId: 2, closureDate: "2026-11-21", liters: 900 },
        { pumpId: 1, closureDate: "2026-11-18", liters: 500 },
      ],
      [1],
      "2026-11-15",
      "2026-11-21",
      "2026-11-19"
    );
    expect(summary.availableDays).toBe(3);
    expect(summary.records).toBe(2);
    expect(summary.totalLiters).toBe(150);
    expect(summary.averageDailyLiters).toBe(50);
  });

  it("does not invent an average before a tank's stock start date", () => {
    const summary = summarizeTankSalesWindow(
      [{ pumpId: 1, closureDate: "2026-11-21", liters: 100 }],
      [1],
      "2026-11-15",
      "2026-11-21",
      "2026-11-22"
    );
    expect(summary.availableDays).toBe(0);
    expect(summary.records).toBe(0);
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
