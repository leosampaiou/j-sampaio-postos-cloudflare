import { describe, expect, it } from "vitest";
import { hasCompletePaymentMethods, parseCurrencyCents } from "./currency";

describe("currency input parsing", () => {
  it("keeps empty values distinct from an explicitly entered zero", () => {
    expect(parseCurrencyCents("")).toBeNull();
    expect(parseCurrencyCents("   ")).toBeNull();
    expect(parseCurrencyCents("0")).toBe(0);
    expect(parseCurrencyCents("0,00")).toBe(0);
  });

  it("parses decimal and Brazilian grouped currency values into cents", () => {
    expect(parseCurrencyCents("125,5")).toBe(12550);
    expect(parseCurrencyCents("125.50")).toBe(12550);
    expect(parseCurrencyCents("1.234,56")).toBe(123456);
    expect(parseCurrencyCents("1.234")).toBe(123400);
  });

  it.each(["-1", "abc", "1,234", "1.23.4", "12,345.67"])(
    "rejects malformed currency input %s",
    value => expect(parseCurrencyCents(value)).toBeNull()
  );
});

describe("closure payment methods", () => {
  it("requires each of the four methods exactly once", () => {
    expect(
      hasCompletePaymentMethods(["dinheiro", "pix", "debito", "credito"])
    ).toBe(true);
    expect(
      hasCompletePaymentMethods([
        "dinheiro",
        "dinheiro",
        "dinheiro",
        "dinheiro",
      ])
    ).toBe(false);
    expect(
      hasCompletePaymentMethods(["dinheiro", "pix", "debito", "outro"])
    ).toBe(false);
    expect(hasCompletePaymentMethods(["dinheiro", "pix", "debito"])).toBe(
      false
    );
  });
});
