import { and, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  appSessions,
  appUsers,
  type AppSession,
  type AppUser,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn(
        "[Database] Failed to initialize:",
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }
  if (!_db) throw new Error("Database is unavailable");
  return _db;
}

export async function findSession(
  tokenHash: string
): Promise<{ session: AppSession; user: AppUser } | undefined> {
  const db = await getDb();
  const [row] = await db
    .select({ session: appSessions, user: appUsers })
    .from(appSessions)
    .innerJoin(appUsers, eq(appSessions.userId, appUsers.id))
    .where(
      and(
        eq(appSessions.tokenHash, tokenHash),
        isNull(appSessions.revokedAt),
        gt(appSessions.expiresAt, new Date()),
        eq(appUsers.active, true)
      )
    )
    .limit(1);
  return row;
}

export async function createSession(
  userId: number,
  tokenHash: string,
  csrfToken: string,
  expiresAt: Date
) {
  const db = await getDb();
  await db
    .insert(appSessions)
    .values({ userId, tokenHash, csrfToken, expiresAt });
}

export async function touchLogin(userId: number) {
  const db = await getDb();
  await db
    .update(appUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(appUsers.id, userId));
}
