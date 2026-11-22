export type StockHealth = "confortavel" | "atencao" | "critico";

export function classifyStockHealth(input: {
  stockLiters: number;
  minimumLiters: number;
  nearMinimumPercent: number;
  autonomyDays: number | null;
  warningAutonomyDays: number;
  criticalAutonomyDays: number;
  stale: boolean;
  discrepancyPercent: number | null;
  discrepancyAlertPercent: number;
}): StockHealth {
  const nearLimit = input.minimumLiters * (1 + input.nearMinimumPercent / 100);
  if (
    input.stockLiters <= input.minimumLiters ||
    (input.autonomyDays !== null &&
      input.autonomyDays < input.criticalAutonomyDays) ||
    (input.discrepancyPercent !== null &&
      Math.abs(input.discrepancyPercent) >= input.discrepancyAlertPercent)
  ) {
    return "critico";
  }
  if (
    input.stockLiters <= nearLimit ||
    (input.autonomyDays !== null &&
      input.autonomyDays < input.warningAutonomyDays) ||
    input.stale
  ) {
    return "atencao";
  }
  return "confortavel";
}

export function suggestedReplenishmentLiters(input: {
  stockLiters: number;
  operationalCapacityLiters: number;
  minimumLiters: number;
  averageDailyLiters: number;
  leadDays: number;
  safetyReserveLiters: number;
}): number {
  const remainingCapacity = Math.max(
    0,
    input.operationalCapacityLiters - input.stockLiters
  );
  const reorderPoint =
    input.minimumLiters +
    input.averageDailyLiters * Math.max(0, input.leadDays) +
    Math.max(0, input.safetyReserveLiters);
  const suggested = Math.max(0, reorderPoint - input.stockLiters);
  return Math.round(Math.min(remainingCapacity, suggested) * 1000) / 1000;
}

export function autonomyInDays(
  stockLiters: number,
  averageDailyLiters: number
): number | null {
  if (
    !Number.isFinite(stockLiters) ||
    !Number.isFinite(averageDailyLiters) ||
    averageDailyLiters <= 0
  )
    return null;
  return Math.max(0, stockLiters) / averageDailyLiters;
}

export function roundLiters(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function calendarDaysInclusive(from: string, to: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === value
      ? time
      : null;
  };
  const start = parse(from);
  const end = parse(to);
  if (start === null || end === null || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function summarizeTankSalesWindow(
  sales: readonly { pumpId: number; closureDate: string; liters: number }[],
  assignedPumpIds: readonly number[] | ReadonlySet<number>,
  windowStart: string,
  today: string,
  stockStartDate: string
) {
  const effectiveStart =
    stockStartDate > windowStart ? stockStartDate : windowStart;
  const availableDays = calendarDaysInclusive(effectiveStart, today);
  const pumpIds =
    assignedPumpIds instanceof Set ? assignedPumpIds : new Set(assignedPumpIds);
  const relevantSales = sales.filter(
    row =>
      pumpIds.has(row.pumpId) &&
      row.closureDate >= effectiveStart &&
      row.closureDate <= today
  );
  const totalLiters = relevantSales.reduce((sum, row) => sum + row.liters, 0);
  return {
    effectiveStart,
    availableDays,
    relevantSales,
    totalLiters,
    averageDailyLiters: availableDays > 0 ? totalLiters / availableDays : 0,
    records: relevantSales.length,
  };
}
