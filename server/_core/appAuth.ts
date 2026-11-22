import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { PostgresDatabase } from "../db.pg";
import { createSessionAndTouchLogin, findSession } from "../db.pg";

const scryptAsync = (password: string, salt: Buffer, keyLength: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: 16384, r: 8, p: 1 },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived as Buffer);
      }
    );
  });
export const APP_SESSION_COOKIE = "jsampaio_session";
export const SESSION_HOURS = 12;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  if (
    n !== "16384" ||
    r !== "8" ||
    p !== "1" ||
    !/^[a-f0-9]{32}$/i.test(saltHex) ||
    !/^[a-f0-9]{128}$/i.test(hashHex)
  )
    return false;
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueSession(db: PostgresDatabase, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await createSessionAndTouchLogin(
    db,
    userId,
    hashToken(token),
    csrfToken,
    expiresAt
  );
  return { token, csrfToken, expiresAt };
}

export async function authenticateRequest(req: Request, db: PostgresDatabase) {
  const cookie = parseCookieHeader(req.headers.get("cookie") ?? "")[
    APP_SESSION_COOKIE
  ];
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  const token = cookie || bearer;
  if (!token || token.length > 200) return null;
  return findSession(db, hashToken(token));
}
