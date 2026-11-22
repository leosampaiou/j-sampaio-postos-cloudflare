import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createContext, type RuntimeBindings } from "../server/_core/context";
import { createRequestDb } from "../server/db.worker";
import { FILE_ROUTE_PREFIX, handleFileRequest } from "./files";

type Env = RuntimeBindings & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TRPC_ENABLED?: string;
};

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface WorkerHandler {
  fetch(
    request: Request,
    env: Env,
    ctx?: WorkerExecutionContext
  ): Promise<Response>;
}
function connectionString(env: Env): string | undefined {
  return env.HYPERDRIVE?.connectionString || env.PG_DATABASE_URL;
}

const jsonHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }
      return jsonResponse({ status: "ok", phase: "worker-scaffold" });
    }

    if (pathname === "/api/trpc" || pathname.startsWith("/api/trpc/")) {
      const dsn = connectionString(env);
      if (env.TRPC_ENABLED === "true" && dsn) {
        const { db, close } = createRequestDb({ connectionString: dsn });
        try {
          return await fetchRequestHandler({
            endpoint: "/api/trpc",
            req: request,
            router: appRouter,
            createContext: ({ req, resHeaders }) =>
              createContext({ req, resHeaders }, env, db),
          });
        } finally {
          const closing = close().catch(() => undefined);
          if (ctx) ctx.waitUntil(closing);
          else await closing;
        }
      }
      return jsonResponse(
        {
          error: "A API ainda não foi migrada para o runtime Cloudflare.",
          code:
            env.TRPC_ENABLED === "true"
              ? "POSTGRES_NOT_CONFIGURED"
              : "MIGRATION_INCOMPLETE",
        },
        503
      );
    }

    if (pathname.startsWith(FILE_ROUTE_PREFIX)) {
      const dsn = connectionString(env);
      if (env.TRPC_ENABLED !== "true" || !dsn || !env.R2) {
        return jsonResponse({ error: "Armazenamento indisponível." }, 503);
      }
      const { db, close } = createRequestDb({ connectionString: dsn });
      try {
        return await handleFileRequest(request, db, env.R2);
      } finally {
        const closing = close().catch(() => undefined);
        if (ctx) ctx.waitUntil(closing);
        else await closing;
      }
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies WorkerHandler;
