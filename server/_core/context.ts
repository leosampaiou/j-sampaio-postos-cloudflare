import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AppSession, AppUser } from "../../drizzle/schema.pg";
import {
  getPostgresDb,
  type HyperdriveBinding,
  type PostgresDatabase,
} from "../db.pg";
import type { R2BucketLike } from "../../worker/files";
import { authenticateRequest } from "./appAuth";

export interface RuntimeBindings {
  PG_DATABASE_URL?: string;
  INITIAL_ADMIN_SETUP_KEY?: string;
  HYPERDRIVE?: HyperdriveBinding;
  R2?: R2BucketLike;
}

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  env: RuntimeBindings;
  db: PostgresDatabase;
  user: AppUser | null;
  session: AppSession | null;
};

function getDatabaseBinding(env: RuntimeBindings): HyperdriveBinding {
  const binding = env.HYPERDRIVE;
  const connectionString = binding?.connectionString ?? env.PG_DATABASE_URL;
  if (!connectionString)
    throw new Error("PostgreSQL/Hyperdrive is not configured");
  return { connectionString };
}

export async function createContext(
  opts: { req: Request; resHeaders: Headers },
  env: RuntimeBindings,
  injectedDb?: PostgresDatabase
): Promise<TrpcContext> {
  const db = injectedDb ?? getPostgresDb(getDatabaseBinding(env));
  const authenticated = await authenticateRequest(opts.req, db);
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    env,
    db,
    user: authenticated?.user ?? null,
    session: authenticated?.session ?? null,
  };
}

export async function createExpressContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const { req, res } = opts;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) {
      headers.set(
        name,
        value.join(name.toLowerCase() === "cookie" ? "; " : ", ")
      );
    }
  }

  const request = new Request(new URL(req.originalUrl, "http://localhost"), {
    method: req.method,
    headers,
  });
  const resHeaders = new Headers();
  const env: RuntimeBindings = {
    PG_DATABASE_URL: process.env.PG_DATABASE_URL,
    INITIAL_ADMIN_SETUP_KEY: process.env.INITIAL_ADMIN_SETUP_KEY,
  };

  // Express remains a development adapter. PostgreSQL must be configured
  // explicitly; this bridge never reads the legacy MySQL DATABASE_URL.
  void res;
  return createContext({ req: request, resHeaders }, env);
}
