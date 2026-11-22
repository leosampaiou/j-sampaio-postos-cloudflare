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

export type TankSalesRecord = {
  closureId: number;
  pumpId: number;
  fuelType: string;
  closureDate: string;
  shift: string;
  finalizedAt: Date | string;
  liters: number;
};

export type TankAssignmentRecord = {
  pumpId: number;
  tankId: number;
  effectiveAt: Date | string;
};

type ClosureSales = {
  date: string;
  shift: string;
  finalizedAt: Date | string;
  rows: TankSalesRecord[];
};
export const MINIMUM_AUTONOMY_SAMPLE_DAYS = 3;
// The station closes at 13:00 (manha) and 22:00 (noite).
const REQUIRED_SHIFTS = ["manha", "noite"] as const;
export function summarizeTankSalesWindow(
  sales: readonly TankSalesRecord[],
  assignedPumpIds: readonly number[] | ReadonlySet<number>,
  assignmentHistory: readonly TankAssignmentRecord[],
  tankId: number,
  fuelType: string,
  windowStart: string,
  today: string,
  stockStartDate: string,
  minimumSampleDays = MINIMUM_AUTONOMY_SAMPLE_DAYS
) {
  const effectiveStart =
    stockStartDate > windowStart ? stockStartDate : windowStart;
  const calendarDays = calendarDaysInclusive(effectiveStart, today);
  const currentlyAssignedPumpIds =
    assignedPumpIds instanceof Set ? assignedPumpIds : new Set(assignedPumpIds);
  const candidatePumpIds = new Set(currentlyAssignedPumpIds);
  const historyByPump = new Map<number, TankAssignmentRecord[]>();
  for (const assignment of assignmentHistory) {
    if (assignment.tankId === tankId && currentlyAssignedPumpIds.size > 0)
      candidatePumpIds.add(assignment.pumpId);
    const entries = historyByPump.get(assignment.pumpId) ?? [];
    entries.push(assignment);
    historyByPump.set(assignment.pumpId, entries);
  }
  for (const entries of historyByPump.values()) {
    entries.sort(
      (a, b) =>
        new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime()
    );
  }
  const assignmentAt = (pumpId: number, at: Date | string) => {
    const timestamp = new Date(at).getTime();
    const entries = historyByPump.get(pumpId) ?? [];
    let tankAtTime: number | null = null;
    for (const entry of entries) {
      if (new Date(entry.effectiveAt).getTime() > timestamp) break;
      tankAtTime = entry.tankId;
    }
    return tankAtTime;
  };
  const closures = new Map<number, ClosureSales>();
  for (const row of sales) {
    if (row.closureDate < effectiveStart || row.closureDate > today) continue;
    const closure = closures.get(row.closureId) ?? {
      date: row.closureDate,
      shift: row.shift,
      finalizedAt: row.finalizedAt,
      rows: [],
    };
    closure.rows.push(row);
    closures.set(row.closureId, closure);
  }
  const byDate = new Map<string, ClosureSales[]>();
  for (const closure of closures.values()) {
    const day = byDate.get(closure.date) ?? [];
    day.push(closure);
    byDate.set(closure.date, day);
  }
  const relevantSales: TankSalesRecord[] = [];
  let coveredDays = 0;
  let totalLiters = 0;
  for (const dayClosures of byDate.values()) {
    const requiredClosures = dayClosures.filter(closure =>
      REQUIRED_SHIFTS.some(shift => shift === closure.shift)
    );
    const shiftCounts = new Map<string, number>();
    for (const closure of requiredClosures)
      shiftCounts.set(closure.shift, (shiftCounts.get(closure.shift) ?? 0) + 1);
    if (
      requiredClosures.length !== REQUIRED_SHIFTS.length ||
      REQUIRED_SHIFTS.some(shift => shiftCounts.get(shift) !== 1)
    )
      continue;
    let dayLiters = 0;
    const dayRows: TankSalesRecord[] = [];
    let fullyCovered = true;
    for (const closure of requiredClosures) {
      const assignedPumps = [...candidatePumpIds].filter(
        pumpId => assignmentAt(pumpId, closure.finalizedAt) === tankId
      );
      if (!assignedPumps.length) {
        fullyCovered = false;
        break;
      }
      for (const pumpId of assignedPumps) {
        const row = closure.rows.find(item => item.pumpId === pumpId);
        if (!row || row.fuelType !== fuelType) {
          fullyCovered = false;
          break;
        }
        const liters = Number(row.liters);
        if (!Number.isFinite(liters) || liters < 0) {
          fullyCovered = false;
          break;
        }
        dayRows.push(row);
        dayLiters += liters;
      }
      if (!fullyCovered) break;
    }
    if (fullyCovered) {
      coveredDays += 1;
      totalLiters += dayLiters;
      relevantSales.push(...dayRows);
    }
  }
  const averageDailyLiters =
    coveredDays >= minimumSampleDays ? totalLiters / coveredDays : 0;
  return {
    effectiveStart,
    availableDays: coveredDays,
    calendarDays,
    coveredDays,
    relevantSales,
    totalLiters,
    averageDailyLiters,
    records: relevantSales.length,
  };
}
