import { describe, expect, it } from "vitest";
import {
  calculateSaleLine,
  expectedClosureSalesCents,
  sumSaleLines,
} from "./productSales";

describe("product sale snapshots", () => {
  it("calculates unit-price totals and fixed commission per unit", () => {
    expect(
      calculateSaleLine(
        { priceCents: 1_250, commissionMode: "fixed", commissionValue: 75 },
        3,
        true
      )
    ).toEqual({
      totalCents: 3_750,
      commissionMode: "fixed",
      commissionValue: 75,
      commissionCents: 225,
    });
  });

  it("uses integer basis points and rounds commission to cents per unit", () => {
    expect(
      calculateSaleLine(
        { priceCents: 1_099, commissionMode: "percent", commissionValue: 250 },
        2,
        true
      )
    ).toEqual({
      totalCents: 2_198,
      commissionMode: "percent",
      commissionValue: 250,
      commissionCents: 54,
    });
  });

  it("records zero commission while the unit-wide switch is off", () => {
    expect(
      calculateSaleLine(
        { priceCents: 3_000, commissionMode: "fixed", commissionValue: 100 },
        2,
        false
      )
    ).toMatchObject({
      totalCents: 6_000,
      commissionMode: "none",
      commissionValue: 0,
      commissionCents: 0,
    });
  });

  it("rejects invalid quantities, percentage basis points and integer overflow", () => {
    expect(() =>
      calculateSaleLine(
        { priceCents: 100, commissionMode: "none", commissionValue: 0 },
        0,
        false
      )
    ).toThrow(RangeError);
    expect(() =>
      calculateSaleLine(
        { priceCents: 100, commissionMode: "percent", commissionValue: 10_001 },
        1,
        true
      )
    ).toThrow(RangeError);
    expect(() =>
      calculateSaleLine(
        { priceCents: 2_147_483_647, commissionMode: "none", commissionValue: 0 },
        2,
        false
      )
    ).toThrow(RangeError);
  });

  it("sums line totals and combines products with fuel only for expected closure sales", () => {
    const lines = [
      calculateSaleLine(
        { priceCents: 500, commissionMode: "none", commissionValue: 0 },
        2,
        true
      ),
      calculateSaleLine(
        { priceCents: 250, commissionMode: "fixed", commissionValue: 10 },
        1,
        true
      ),
    ];
    expect(sumSaleLines(lines)).toEqual({ totalCents: 1_250, commissionCents: 10 });
    expect(expectedClosureSalesCents(125_000, 1_250)).toBe(126_250);
    expect(() => expectedClosureSalesCents(2_147_483_647, 1)).toThrow(RangeError);
  });
});
