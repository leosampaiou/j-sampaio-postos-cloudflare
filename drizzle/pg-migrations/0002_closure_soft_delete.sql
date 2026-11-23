ALTER TABLE "closures" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;--> statement-breakpoint
DROP INDEX IF EXISTS "closure_unit_date_shift_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "closure_unit_date_shift_active_unique" ON "closures" USING btree ("unitId", "closureDate", "shift") WHERE "deletedAt" IS NULL;
