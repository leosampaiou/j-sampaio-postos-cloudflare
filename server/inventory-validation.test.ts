import { describe, expect, it } from "vitest";
import { positiveLitersInput } from "./routers/inventory";

describe("positiveLitersInput", () => {
  it("accepts volumes at the form's 0.001 L minimum and rounds to three decimals", () => {
    expect(positiveLitersInput.parse(0.001)).toBe(0.001);
    expect(positiveLitersInput.parse(1.23456)).toBe(1.235);
  });

  it("rejects positive values below the form's 0.001 L minimum", () => {
    expect(positiveLitersInput.safeParse(0.0004).success).toBe(false);
    expect(positiveLitersInput.safeParse(0.0009).success).toBe(false);
  });
});
