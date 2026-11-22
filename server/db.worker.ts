import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema.pg";
import type { HyperdriveBinding, PostgresDatabase } from "./db.pg";

/**
 * Workers não permitem reutilizar sockets/objetos de I/O entre requisições.
 * Cada requisição abre seu próprio cliente (o pool real fica no Hyperdrive) e o
 * Worker o encerra em `waitUntil(close())`.
 */
export function createRequestDb(binding: HyperdriveBinding): {
  db: PostgresDatabase;
  close: () => Promise<void>;
} {
  let protocol: string;
  try {
    protocol = new URL(binding.connectionString).protocol;
  } catch {
    throw new Error("Hyperdrive connection string is invalid");
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:")
    throw new Error("Hyperdrive must provide a PostgreSQL connection string");
  const client = postgres(binding.connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    fetch_types: false,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
