import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { systemRouter } from "./systemRouter";

describe("system.notifyOwner", () => {
  it("stays disabled until an independent notification channel is configured", async () => {
    const ctx = {
      user: { id: 1, role: "administrador" },
      session: { csrfToken: "valid-csrf-token" },
      req: new Request("https://example.test/api/trpc/system.notifyOwner", {
        method: "POST",
        headers: { "x-csrf-token": "valid-csrf-token" },
      }),
      resHeaders: new Headers(),
      env: {},
      db: {},
    } as unknown as TrpcContext;
    const caller = systemRouter.createCaller(ctx);

    await expect(
      caller.notifyOwner({ title: "Test", content: "No message is sent" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Notificação ao proprietário desativada até a configuração de um canal independente.",
    });
  });
});
