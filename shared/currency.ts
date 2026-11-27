export const paymentMethodOrder = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
] as const;

export function hasCompletePaymentMethods(methods: readonly string[]): boolean {
  return (
    methods.length === paymentMethodOrder.length &&
    new Set(methods).size === paymentMethodOrder.length &&
    paymentMethodOrder.every(method => methods.includes(method))
  );
}

export function parseCurrencyCents(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const groupedBrazilianAmount = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(
    normalized
  );
  const decimalOrInteger = /^\d+(?:[,.]\d{1,2})?$/.test(normalized);
  if (!groupedBrazilianAmount && !decimalOrInteger) return null;

  const canonical = groupedBrazilianAmount
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized.replace(",", ".");
  const amount = Number(canonical);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
