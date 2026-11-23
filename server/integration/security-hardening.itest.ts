import { inArray, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../drizzle/schema.pg";
import { consumeLoginAttempt } from "../loginRateLimit";
import { createIntegrationHarness, integrationEnabled } from "./harness";

describe.skipIf(!integrationEnabled)("hardening de segurança PostgreSQL", () => {
  it("compartilha limites entre conexões PostgreSQL independentes", async () => {
    const harness = await createIntegrationHarness();
    const client = postgres(harness.connectionString, { max: 1 });
    const secondDb = drizzle(client, { schema });
    try {
      const ip = "198.51.100.42";
      const username = "usuario-teste";
      for (let attempt = 0; attempt < 8; attempt++) {
        expect(await consumeLoginAttempt(harness.db, ip, username)).toBe(true);
      }
      expect(await consumeLoginAttempt(secondDb, ip, username)).toBe(false);
      const rows = await harness.db.select().from(schema.loginAttemptLimits);
      expect(rows).toHaveLength(2);
      expect(rows.map(row => row.scope).sort()).toEqual(["ip", "pair"]);
    } finally {
      await client.end();
    }
  });

  it("permite no máximo um vínculo concorrente para o mesmo funcionário", async () => {
    const harness = await createIntegrationHarness();
    const admin = await harness.bootstrapAdmin();
    const employeeId = await harness.createEmployee(admin, "Frentista Concorrente");
    const caller = await harness.as(admin);
    const results = await Promise.allSettled([
      caller.users.create({
        username: "vinculo.um",
        fullName: "Conta Um",
        password: "Senha forte 123!",
        role: "frentista",
        employeeId,
      }),
      caller.users.create({
        username: "vinculo.dois",
        fullName: "Conta Dois",
        password: "Senha forte 456!",
        role: "frentista",
        employeeId,
      }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const [employee] = await harness.db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId));
    expect(employee.linkedUserId).not.toBeNull();
    const linkedUsers = await harness.db
      .select()
      .from(schema.appUsers)
      .where(inArray(schema.appUsers.username, ["vinculo.um", "vinculo.dois"]));
    expect(linkedUsers).toHaveLength(1);
  });
});
