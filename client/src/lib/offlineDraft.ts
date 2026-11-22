export type OfflineDraftPayload = {
  closureId?: number;
  changeReason?: string;
  closureDate: string;
  shift: "manha" | "tarde" | "noite";
  employeeId: number;
  responsibleName: string;
  notes: string;
  employeeConfirmed: boolean;
  responsibleConfirmed: boolean;
  nozzles: Array<{
    pumpId: number;
    initialReading: string;
    finalReading: string;
  }>;
  payments: Array<{
    method: "dinheiro" | "pix" | "debito" | "credito";
    amountCents: number;
  }>;
};

const storageKey = (userId: number) => `jsampaio-offline-draft:${userId}`;

export function saveOfflineDraft(
  userId: number,
  payload: OfflineDraftPayload
): boolean {
  try {
    sessionStorage.setItem(
      storageKey(userId),
      JSON.stringify({ userId, savedAt: new Date().toISOString(), payload })
    );
    return true;
  } catch {
    return false;
  }
}

export function readOfflineDraft(userId: number): OfflineDraftPayload | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      userId?: number;
      payload?: OfflineDraftPayload;
    };
    if (
      parsed.userId !== userId ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.nozzles) ||
      !Array.isArray(parsed.payload.payments)
    )
      return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function clearOfflineDraft(userId: number): void {
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Storage may be unavailable or blocked by browser privacy settings.
  }
}
