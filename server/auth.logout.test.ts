import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { revokeCurrentSession } from "./_core/logout";

describe("auth.logout", () => {
  it("rejects requests without an authenticated application session", async () => {
    const ctx = {
      user: null,
      session: null,
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => undefined },
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.logout()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("revokes the authenticated session hash before clearing its cookie", async () => {
    const events: string[] = [];
    const revoke = vi.fn(async (hash: string) => {
      events.push(`revoke:${hash}`);
    });
    const clearCookie = vi.fn(() => {
      events.push("clear-cookie");
    });

    await expect(
      revokeCurrentSession("stored-session-hash", revoke, clearCookie)
    ).resolves.toEqual({ success: true });
    expect(revoke).toHaveBeenCalledWith("stored-session-hash");
    expect(events).toEqual(["revoke:stored-session-hash", "clear-cookie"]);
  });

  it("does not clear the cookie when backend revocation fails", async () => {
    const clearCookie = vi.fn();
    await expect(
      revokeCurrentSession(
        "stored-session-hash",
        async () => {
          throw new Error("database unavailable");
        },
        clearCookie
      )
    ).rejects.toThrow("database unavailable");
    expect(clearCookie).not.toHaveBeenCalled();
  });
});
