import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema.pg";
import type { AppSession, AppUser } from "../drizzle/schema.pg";

export interface HyperdriveBinding {
  connectionString: string;
}

export type PostgresDatabase = PostgresJsDatabase<typeof schema>;
type PostgresClient = ReturnType<typeof postgres>;

type DatabaseConnection = {
  client: PostgresClient;
  db: PostgresDatabase;
};

// A Worker isolate may serve many requests. Reuse one bounded client per binding
// string; the string is read from the runtime binding and is never logged.
const connections = new Map<string, DatabaseConnection>();

export function getPostgresDb(binding: HyperdriveBinding): PostgresDatabase {
  const connectionString = binding.connectionString;
  if (!connectionString) throw new Error("Hyperdrive connection is unavailable");

  let protocol: string;
  try {
    protocol = new URL(connectionString).protocol;
  } catch {
    throw new Error("Hyperdrive connection string is invalid");
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error("Hyperdrive must provide a PostgreSQL connection string");
  }

  const existing = connections.get(connectionString);
  if (existing) return existing.db;

  const client = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  connections.set(connectionString, { client, db });
  return db;
}

export async function findSession(
  db: PostgresDatabase,
  tokenHash: string
): Promise<{ session: AppSession; user: AppUser } | undefined> {
  const [row] = await db
    .select({ session: schema.appSessions, user: schema.appUsers })
    .from(schema.appSessions)
    .innerJoin(schema.appUsers, eq(schema.appSessions.userId, schema.appUsers.id))
    .where(
      and(
        eq(schema.appSessions.tokenHash, tokenHash),
        isNull(schema.appSessions.revokedAt),
        gt(schema.appSessions.expiresAt, new Date()),
        eq(schema.appUsers.active, true)
      )
    )
    .limit(1);
  return row;
}

export async function createSession(
  db: PostgresDatabase,
  userId: number,
  tokenHash: string,
  csrfToken: string,
  expiresAt: Date
) {
  await db.insert(schema.appSessions).values({
    userId,
    tokenHash,
    csrfToken,
    expiresAt,
  });
}

export async function touchLogin(db: PostgresDatabase, userId: number) {
  await db
    .update(schema.appUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.appUsers.id, userId));
}

export async function createSessionAndTouchLogin(
  db: PostgresDatabase,
  userId: number,
  tokenHash: string,
  csrfToken: string,
  expiresAt: Date
) {
  await db.transaction(async tx => {
    await tx.insert(schema.appSessions).values({
      userId,
      tokenHash,
      csrfToken,
      expiresAt,
    });
    await tx
      .update(schema.appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.appUsers.id, userId));
  });
}
