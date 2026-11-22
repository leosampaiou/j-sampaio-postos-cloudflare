export type PercentageShare = { employeeId: number; sharePercent: number };
export type CentAllocation = PercentageShare & { allocatedCents: number };

/** Distributes integer cents exactly, assigning rounding remainders by largest fractional share. */
export function allocateCentsByShare(
  totalCents: number,
  shares: PercentageShare[]
): CentAllocation[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new RangeError("totalCents must be a non-negative safe integer");
  if (shares.length === 0)
    throw new RangeError("at least one participant is required");
  if (new Set(shares.map(share => share.employeeId)).size !== shares.length)
    throw new RangeError("participant IDs must be unique");
  if (
    shares.some(
      share =>
        !Number.isInteger(share.employeeId) ||
        share.employeeId < 1 ||
        !Number.isInteger(share.sharePercent) ||
        share.sharePercent < 1 ||
        share.sharePercent > 100
    )
  ) {
    throw new RangeError(
      "participants must have valid IDs and positive integer percentages"
    );
  }
  if (shares.reduce((sum, share) => sum + share.sharePercent, 0) !== 100)
    throw new RangeError("participant percentages must total 100");

  const rows = shares.map((share, index) => {
    const exactCents = (totalCents * share.sharePercent) / 100;
    const allocatedCents = Math.floor(exactCents);
    return {
      ...share,
      index,
      allocatedCents,
      remainder: exactCents - allocatedCents,
    };
  });
  let centsLeft =
    totalCents - rows.reduce((sum, row) => sum + row.allocatedCents, 0);
  const remainderOrder = [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.employeeId - b.employeeId
  );
  for (let index = 0; index < centsLeft; index++)
    remainderOrder[index].allocatedCents++;
  return rows
    .sort((a, b) => a.index - b.index)
    .map(({ employeeId, sharePercent, allocatedCents }) => ({
      employeeId,
      sharePercent,
      allocatedCents,
    }));
}
