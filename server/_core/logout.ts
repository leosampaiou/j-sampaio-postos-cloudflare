export async function revokeCurrentSession(
  tokenHash: string,
  revoke: (hash: string) => Promise<void>,
  clearCookie: () => void
) {
  await revoke(tokenHash);
  clearCookie();
  return { success: true as const };
}
