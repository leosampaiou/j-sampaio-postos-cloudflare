export const closureShiftOrder = ["manha", "tarde", "noite"] as const;

export type ClosureShift = (typeof closureShiftOrder)[number];

export function previousClosureShifts(shift: ClosureShift): ClosureShift[] {
  return closureShiftOrder.slice(0, closureShiftOrder.indexOf(shift));
}

export function isBeforeClosureSlot(
  candidate: { closureDate: string; shift: ClosureShift },
  target: { closureDate: string; shift: ClosureShift }
): boolean {
  if (candidate.closureDate !== target.closureDate)
    return candidate.closureDate < target.closureDate;
  return (
    closureShiftOrder.indexOf(candidate.shift) <
    closureShiftOrder.indexOf(target.shift)
  );
}

export function parseReadingMilli(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export function matchesLatestReadingBaseline(
  saved: readonly { pumpId: number; initialReading: string }[],
  latest: readonly { pumpId: number; finalReading: string }[]
): boolean {
  if (!saved.length) return false;
  const latestByPump = new Map(
    latest.map(reading => [reading.pumpId, reading.finalReading])
  );
  return saved.every(reading => {
    const baseline = latestByPump.get(reading.pumpId);
    const initialMilli = parseReadingMilli(reading.initialReading);
    const baselineMilli = baseline ? parseReadingMilli(baseline) : null;
    return (
      initialMilli !== null &&
      baselineMilli !== null &&
      initialMilli === baselineMilli
    );
  });
}
