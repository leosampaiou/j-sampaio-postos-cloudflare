import { describe, expect, it } from "vitest";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createContext, createExpressContext } from "./context";
import { appendExpiredSessionCookie, appendSessionCookie } from "./cookies";

describe("session cookies", () => {
  it("sets the 12-hour session cookie with the required security flags", () => {
    const headers = new Headers();
    appendSessionCookie(headers, "jsampaio_session", "session-token");

    const [cookie] = headers.getSetCookie();
    expect(cookie).toContain("jsampaio_session=session-token");
    expect(cookie).toContain("Max-Age=43200");
    expect(cookie).toMatch(/(?:^|; )Path=\//);
    expect(cookie).toMatch(/(?:^|; )HttpOnly(?:;|$)/);
    expect(cookie).toMatch(/(?:^|; )Secure(?:;|$)/);
    expect(cookie).toMatch(/(?:^|; )SameSite=None(?:;|$)/);
  });

  it("expires the session cookie without collapsing separate Set-Cookie headers", () => {
    const headers = new Headers();
    appendExpiredSessionCookie(headers, "jsampaio_session");
    appendSessionCookie(headers, "another_cookie", "another-token");

    const cookies = headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("Max-Age=0");
    expect(cookies[0]).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookies[1]).toContain("another_cookie=another-token");
  });
});

describe("Express request context bridge", () => {
  it("never falls back to the legacy MySQL DATABASE_URL", async () => {
    const previousPgUrl = process.env.PG_DATABASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.PG_DATABASE_URL;
    process.env.DATABASE_URL = "mysql://legacy.invalid/app";

    try {
      await expect(
        createContext(
          {
            req: new Request("https://example.test"),
            resHeaders: new Headers(),
          },
          {}
        )
      ).rejects.toThrow("PostgreSQL/Hyperdrive is not configured");
    } finally {
      if (previousPgUrl === undefined) delete process.env.PG_DATABASE_URL;
      else process.env.PG_DATABASE_URL = previousPgUrl;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("converts method, path, and repeated cookie headers to Fetch Request", async () => {
    const previousPgUrl = process.env.PG_DATABASE_URL;
    process.env.PG_DATABASE_URL =
      "postgres://context-test:context-test@127.0.0.1:5432/context-test";
    const req = {
      method: "POST",
      originalUrl: "/api/trpc/example?batch=1",
      headers: {
        cookie: ["first=one", "second=two"],
        "x-csrf-token": "csrf-value",
        host: "untrusted.example",
      },
    };
    try {
      const ctx = await createExpressContext({
        req: req as unknown as CreateExpressContextOptions["req"],
        res: {} as CreateExpressContextOptions["res"],
      });

      expect(ctx.req).toBeInstanceOf(Request);
      expect(ctx.req.method).toBe("POST");
      expect(ctx.req.url).toBe("http://localhost/api/trpc/example?batch=1");
      expect(ctx.req.headers.get("cookie")).toBe("first=one; second=two");
      expect(ctx.req.headers.get("x-csrf-token")).toBe("csrf-value");
      expect(ctx.resHeaders.getSetCookie()).toEqual([]);
      expect(ctx.env.INITIAL_ADMIN_SETUP_KEY).toBe(
        process.env.INITIAL_ADMIN_SETUP_KEY
      );
    } finally {
      if (previousPgUrl === undefined) delete process.env.PG_DATABASE_URL;
      else process.env.PG_DATABASE_URL = previousPgUrl;
    }
  });
});
