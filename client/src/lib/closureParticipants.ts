export type ClosureParticipantDraft = {
  employeeId: number;
  sharePercent: string;
};

export type ClosureParticipantPayload = {
  employeeId: number;
  sharePercent: number;
};

export function toggleClosureParticipant(
  current: readonly ClosureParticipantDraft[],
  employeeId: number,
  selected: boolean
): ClosureParticipantDraft[] {
  const alreadySelected = current.some(
    person => person.employeeId === employeeId
  );
  if (selected === alreadySelected) return [...current];

  if (selected) {
    const next = [...current, { employeeId, sharePercent: "" }];
    if (next.length === 1) return [{ ...next[0], sharePercent: "100" }];
    if (current.length === 1)
      return next.map(person => ({ ...person, sharePercent: "" }));
    return next;
  }

  const next = current.filter(person => person.employeeId !== employeeId);
  if (next.length === 1) return [{ ...next[0], sharePercent: "100" }];
  return next;
}

export function toClosureParticipantPayload(
  participants: readonly ClosureParticipantDraft[]
): ClosureParticipantPayload[] {
  return participants.map(person => ({
    employeeId: person.employeeId,
    sharePercent: participants.length === 1 ? 100 : Number(person.sharePercent),
  }));
}
