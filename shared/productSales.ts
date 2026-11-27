export type CommissionMode = "none" | "percent" | "fixed";

export type ProductPricing = {
  priceCents: number;
  commissionMode: CommissionMode;
  commissionValue: number;
};

export type CalculatedSaleLine = {
  totalCents: number;
  commissionMode: CommissionMode;
  commissionValue: number;
  commissionCents: number;
};

const MAX_INTEGER = 2_147_483_647;

export function calculateSaleLine(
  product: ProductPricing,
  quantity: number,
  commissionsEnabled: boolean
): CalculatedSaleLine {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000)
    throw new RangeError("A quantidade deve ser um inteiro entre 1 e 10.000.");
  if (
    !Number.isInteger(product.priceCents) ||
    product.priceCents < 0 ||
    product.priceCents > MAX_INTEGER
  )
    throw new RangeError("O preço do produto é inválido.");
  const totalCents = product.priceCents * quantity;
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_INTEGER)
    throw new RangeError("O total da venda excede o limite permitido.");

  const commissionMode = commissionsEnabled
    ? product.commissionMode
    : "none";
  const commissionValue = commissionMode === "none" ? 0 : product.commissionValue;
  if (
    !Number.isInteger(commissionValue) ||
    commissionValue < 0 ||
    (commissionMode === "percent" && commissionValue > 10_000) ||
    commissionValue > MAX_INTEGER
  )
    throw new RangeError("A configuração de comissão é inválida.");
  const perUnitCommissionCents =
    commissionMode === "percent"
      ? Math.round((product.priceCents * commissionValue) / 10_000)
      : commissionMode === "fixed"
        ? commissionValue
        : 0;
  const commissionCents = perUnitCommissionCents * quantity;
  if (!Number.isSafeInteger(commissionCents) || commissionCents > MAX_INTEGER)
    throw new RangeError("A comissão excede o limite permitido.");
  return {
    totalCents,
    commissionMode,
    commissionValue,
    commissionCents,
  };
}

export function sumSaleLines(lines: readonly CalculatedSaleLine[]) {
  const totals = lines.reduce(
    (sum, line) => ({
      totalCents: sum.totalCents + line.totalCents,
      commissionCents: sum.commissionCents + line.commissionCents,
    }),
    { totalCents: 0, commissionCents: 0 }
  );
  if (
    !Number.isSafeInteger(totals.totalCents) ||
    totals.totalCents > MAX_INTEGER ||
    !Number.isSafeInteger(totals.commissionCents) ||
    totals.commissionCents > MAX_INTEGER
  )
    throw new RangeError("O total da venda excede o limite permitido.");
  return totals;
}

export function expectedClosureSalesCents(
  fuelSalesCents: number,
  productSalesCents: number
) {
  const expected = fuelSalesCents + productSalesCents;
  if (
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    expected > MAX_INTEGER
  )
    throw new RangeError("O total esperado excede o limite permitido.");
  return expected;
}
