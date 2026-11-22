import { describe, expect, it, vi } from "vitest";
import worker from "./index";

function makeEnv() {
  const fetch = vi.fn(async () => new Response("app-shell", { status: 200 }));
  return { env: { ASSETS: { fetch } }, fetch };
}

describe("Cloudflare Worker scaffold", () => {
  it("reports only that the scaffold handler is available", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/api/health"),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      phase: "worker-scaffold",
    });
  });

  it("does not pretend that the unmigrated tRPC API works", async () => {
    const { env, fetch } = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/api/trpc/auth.me"),
      env
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "MIGRATION_INCOMPLETE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps tRPC unavailable unless explicitly enabled", async () => {
    const { env } = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/api/trpc/system.health?input=%7B%7D"),
      { ...env, TRPC_ENABLED: "false" }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "MIGRATION_INCOMPLETE",
    });
  });

  it("does not activate tRPC without an explicit PostgreSQL binding", async () => {
    const { env, fetch } = makeEnv();
    const response = await worker.fetch(
      new Request("https://example.test/api/trpc/system.health?input=%7B%7D"),
      { ...env, TRPC_ENABLED: "true" }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "POSTGRES_NOT_CONFIGURED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("routes non-API requests to the static assets binding", async () => {
    const { env, fetch } = makeEnv();
    const request = new Request("https://example.test/historico");
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(request);
    await expect(response.text()).resolves.toBe("app-shell");
  });
});
