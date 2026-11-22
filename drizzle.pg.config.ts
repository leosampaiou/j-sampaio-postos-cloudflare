import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.pg.ts",
  out: "./drizzle/pg-migrations",
  dialect: "postgresql",
});
