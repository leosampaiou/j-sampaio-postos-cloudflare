export type ClosureArchiveCandidate = {
  status: string;
  finalizedAt?: Date | string | null;
  reopenedAt?: Date | string | null;
  hasStockMovement: boolean;
  hasDiscrepancyCase: boolean;
};

export function isClosureArchivable(
  candidate: ClosureArchiveCandidate
): boolean {
  return (
    candidate.status === "rascunho" &&
    !candidate.finalizedAt &&
    !candidate.reopenedAt &&
    !candidate.hasStockMovement &&
    !candidate.hasDiscrepancyCase
  );
}
