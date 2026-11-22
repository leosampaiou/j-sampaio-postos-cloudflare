import { describe, expect, it } from "vitest";
import { getPostgresDb } from "./db.pg";

describe("getPostgresDb", () => {
  it("rejects malformed connection strings without exposing the value", () => {
    expect(() => getPostgresDb({ connectionString: "not-a-dsn" })).toThrow(
      "Hyperdrive connection string is invalid"
    );
  });

  it("rejects non-PostgreSQL protocols before creating a client", () => {
    expect(() =>
      getPostgresDb({ connectionString: "mysql://user:secret@host/database" })
    ).toThrow("Hyperdrive must provide a PostgreSQL connection string");
  });
});
