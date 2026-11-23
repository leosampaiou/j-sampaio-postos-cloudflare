import { and, eq, lt, sql } from "drizzle-orm";
import type { PostgresDatabase } from "./db.pg";
import { loginAttemptLimits } from "../drizzle/schema.pg";
import {
  LOGIN_IP_REQUEST_LIMIT,
  LOGIN_LOCKOUT_BASE_SECONDS,
  LOGIN_LOCKOUT_MAX_SECONDS,
  LOGIN_PAIR_REQUEST_LIMIT,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from "./loginRateLimitPolicy";

const encoder = new TextEncoder();
const RETENTION_MS = 24 * 60 * 60 * 1000;

async function digestKey(scope: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${scope}\0${value}`)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function consumeBucket(
  db: PostgresDatabase,
  scope: "ip" | "pair",
  keyHash: string,
  now: Date
): Promise<boolean> {
  const threshold =
    scope === "pair" ? LOGIN_PAIR_REQUEST_LIMIT : LOGIN_IP_REQUEST_LIMIT;
  const baseSeconds = scope === "pair" ? LOGIN_LOCKOUT_BASE_SECONDS : 15;
  const windowCutoff = new Date(
    now.getTime() - LOGIN_RATE_LIMIT_WINDOW_MS
  ).toISOString();
  const nowIso = now.toISOString();
  const expired = sql`${loginAttemptLimits.windowStartedAt} <= ${windowCutoff}::timestamptz`;
  const activelyBlocked = sql`${loginAttemptLimits.blockedUntil} > ${nowIso}::timestamptz`;
  const nextCount = sql<number>`CASE
    WHEN ${expired} THEN 1
    WHEN ${activelyBlocked} THEN ${loginAttemptLimits.requestCount}
    ELSE ${loginAttemptLimits.requestCount} + 1
  END`;
  const delaySeconds = sql<number>`LEAST(
    ${LOGIN_LOCKOUT_MAX_SECONDS},
    ${baseSeconds} * power(2, GREATEST(0, ${nextCount} - ${threshold} - 1))
  )`;
  const [bucket] = await db
    .insert(loginAttemptLimits)
    .values({
      scope,
      keyHash,
      requestCount: 1,
      windowStartedAt: now,
      blockedUntil: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [loginAttemptLimits.scope, loginAttemptLimits.keyHash],
      set: {
        requestCount: nextCount,
        windowStartedAt: sql`CASE
          WHEN ${expired} THEN ${nowIso}::timestamptz
          ELSE ${loginAttemptLimits.windowStartedAt}
        END`,
        blockedUntil: sql`CASE
          WHEN ${expired} THEN NULL
          WHEN ${activelyBlocked} THEN ${loginAttemptLimits.blockedUntil}
          WHEN ${nextCount} > ${threshold}
            THEN to_timestamp(${Math.floor(now.getTime() / 1000)} + ${delaySeconds})
          ELSE NULL
        END`,
        updatedAt: now,
      },
    })
    .returning({
      blockedUntil: sql<number | null>`extract(epoch from ${loginAttemptLimits.blockedUntil})`,
    });

  return !bucket?.blockedUntil || bucket.blockedUntil * 1000 <= now.getTime();
}

async function cleanupExpiredRows(db: PostgresDatabase, now: Date) {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
  try {
    await db.execute(sql`
      WITH expired AS (
        SELECT ctid
        FROM "loginAttemptLimits"
        WHERE "updatedAt" < ${cutoff}::timestamptz
        ORDER BY "updatedAt"
        LIMIT 200
      )
      DELETE FROM "loginAttemptLimits"
      WHERE ctid IN (SELECT ctid FROM expired)
    `);
  } catch {
    // Cleanup is opportunistic; it must not turn a valid login into an outage.
  }
}

/**
 * Reserves a request in two persistent, atomic buckets. The pair bucket is keyed by
 * IP plus normalized username; the IP bucket prevents spraying many usernames.
 * Raw addresses and usernames are never stored in the limiter table.
 */
export async function consumeLoginAttempt(
  db: PostgresDatabase,
  ipAddress: string,
  normalizedUsername: string,
  now = new Date()
): Promise<boolean> {
  const safeIp = ipAddress.trim().slice(0, 128) || "unknown";
  const username = normalizedUsername.trim().toLowerCase().slice(0, 48);
  const ipHash = await digestKey("ip", safeIp);
  const pairHash = await digestKey("pair", `${safeIp}\0${username}`);

  const [ipAllowed, pairAllowed] = await Promise.all([
    consumeBucket(db, "ip", ipHash, now),
    consumeBucket(db, "pair", pairHash, now),
  ]);

  // Occasional, bounded cleanup prevents attacker-controlled key cardinality from
  // retaining expired buckets indefinitely. This is not part of the rate-limit state.
  if (crypto.getRandomValues(new Uint32Array(1))[0] % 128 === 0)
    await cleanupExpiredRows(db, now);

  return ipAllowed && pairAllowed;
}

/** A successful password check clears only its IP/account pair, never the IP bucket. */
export async function clearSuccessfulLoginPair(
  db: PostgresDatabase,
  ipAddress: string,
  normalizedUsername: string
) {
  const safeIp = ipAddress.trim().slice(0, 128) || "unknown";
  const username = normalizedUsername.trim().toLowerCase().slice(0, 48);
  const keyHash = await digestKey("pair", `${safeIp}\0${username}`);
  await db
    .delete(loginAttemptLimits)
    .where(
      and(
        eq(loginAttemptLimits.scope, "pair"),
        eq(loginAttemptLimits.keyHash, keyHash)
      )
    );
}
