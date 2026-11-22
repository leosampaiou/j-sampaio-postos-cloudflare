import { describe, expect, it } from "vitest";
import {
  canTransitionPayrollReview,
  isApprovedAmountValid,
  payrollAdjustmentInitialStatuses,
} from "./payrollReview";

describe("payroll review transitions", () => {
  it("starts new reviews only at initial analysis states", () => {
    expect(payrollAdjustmentInitialStatuses).toEqual([
      "nao_elegivel",
      "aguardando_analise",
    ]);
    expect([...payrollAdjustmentInitialStatuses]).not.toContain(
      "aguardando_autorizacao"
    );
  });

  it("requires analysis authorization before approval", () => {
    expect(
      canTransitionPayrollReview("aguardando_analise", "aguardando_autorizacao")
    ).toBe(true);
    expect(canTransitionPayrollReview("aguardando_analise", "aprovado")).toBe(
      false
    );
    expect(
      canTransitionPayrollReview("aguardando_autorizacao", "aprovado")
    ).toBe(true);
  });

  it("requires approval before forwarding and forwarding before processing", () => {
    expect(canTransitionPayrollReview("aprovado", "encaminhado_folha")).toBe(
      true
    );
    expect(
      canTransitionPayrollReview("aguardando_autorizacao", "encaminhado_folha")
    ).toBe(false);
    expect(canTransitionPayrollReview("encaminhado_folha", "processado")).toBe(
      true
    );
    expect(canTransitionPayrollReview("aprovado", "processado")).toBe(false);
  });

  it("keeps completed and rejected records terminal", () => {
    expect(canTransitionPayrollReview("processado", "aguardando_analise")).toBe(
      false
    );
    expect(canTransitionPayrollReview("rejeitado", "aprovado")).toBe(false);
    expect(
      canTransitionPayrollReview("nao_elegivel", "aguardando_autorizacao")
    ).toBe(false);
  });

  it("requires an amount for approval and caps optional amounts in later states", () => {
    expect(isApprovedAmountValid("aprovado", undefined, 5000)).toBe(false);
    expect(isApprovedAmountValid("aprovado", 5000, 5000)).toBe(true);
    expect(isApprovedAmountValid("encaminhado_folha", undefined, 5000)).toBe(
      true
    );
    expect(isApprovedAmountValid("encaminhado_folha", 5001, 5000)).toBe(false);
    expect(isApprovedAmountValid("processado", 2500, 5000)).toBe(true);
  });
});
