CREATE TYPE "public"."app_user_role" AS ENUM('frentista', 'gerente', 'administrador');--> statement-breakpoint
CREATE TYPE "public"."closure_result" AS ENUM('pendente', 'conferido', 'sobra', 'falta');--> statement-breakpoint
CREATE TYPE "public"."closure_shift" AS ENUM('manha', 'tarde', 'noite');--> statement-breakpoint
CREATE TYPE "public"."closure_status" AS ENUM('rascunho', 'aguardando_conferencia', 'finalizado', 'reaberto');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_status" AS ENUM('pendente_analise', 'em_investigacao', 'justificada', 'encerrada_sem_desconto', 'encaminhada_administrativo', 'resolvida', 'cancelada_por_correcao');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_type" AS ENUM('sobra', 'falta');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('gasolina_comum', 'diesel_s10');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('dinheiro', 'pix', 'debito', 'credito');--> statement-breakpoint
CREATE TYPE "public"."payroll_review_status" AS ENUM('nao_elegivel', 'aguardando_analise', 'aguardando_autorizacao', 'aprovado', 'rejeitado', 'encaminhado_folha', 'processado');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('opening', 'receipt', 'sale', 'writeoff', 'correction');--> statement-breakpoint
CREATE TABLE "appSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"csrfToken" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appSessions_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE "appUsers" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"username" varchar(48) NOT NULL,
	"fullName" varchar(160) NOT NULL,
	"passwordHash" varchar(255) NOT NULL,
	"role" "app_user_role" DEFAULT 'frentista' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastLoginAt" timestamp with time zone,
	CONSTRAINT "appUsers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auditEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"userId" integer NOT NULL,
	"targetType" varchar(40) NOT NULL,
	"targetId" integer NOT NULL,
	"action" varchar(48) NOT NULL,
	"field" varchar(80),
	"beforeValue" text,
	"afterValue" text,
	"reason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closureNozzles" (
	"id" serial PRIMARY KEY NOT NULL,
	"closureId" integer NOT NULL,
	"pumpId" integer NOT NULL,
	"pumpNumber" varchar(24) NOT NULL,
	"fuelType" "fuel_type" NOT NULL,
	"initialReading" numeric(14, 3) NOT NULL,
	"finalReading" numeric(14, 3) NOT NULL,
	"liters" numeric(14, 3) NOT NULL,
	"priceCents" integer NOT NULL,
	"valueCents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closureParticipants" (
	"id" serial PRIMARY KEY NOT NULL,
	"closureId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"sharePercent" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closurePayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"closureId" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"amountCents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"closureDate" varchar(10) NOT NULL,
	"shift" "closure_shift" NOT NULL,
	"employeeId" integer NOT NULL,
	"responsibleName" varchar(160) NOT NULL,
	"createdBy" integer NOT NULL,
	"status" "closure_status" DEFAULT 'rascunho' NOT NULL,
	"result" "closure_result" DEFAULT 'pendente' NOT NULL,
	"salesCents" integer DEFAULT 0 NOT NULL,
	"receivedCents" integer DEFAULT 0 NOT NULL,
	"differenceCents" integer DEFAULT 0 NOT NULL,
	"toleranceCents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"employeeConfirmed" boolean DEFAULT false NOT NULL,
	"responsibleConfirmed" boolean DEFAULT false NOT NULL,
	"finalizedAt" timestamp with time zone,
	"reopenedAt" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancyAllocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"caseId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"closureRevision" integer NOT NULL,
	"allocatedCents" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancyCases" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"closureId" integer NOT NULL,
	"closureRevision" integer NOT NULL,
	"type" "discrepancy_type" NOT NULL,
	"amountCents" integer NOT NULL,
	"status" "discrepancy_status" DEFAULT 'pendente_analise' NOT NULL,
	"justification" text,
	"reviewNotes" text,
	"evidenceKey" varchar(420),
	"decisionBy" integer,
	"decisionAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"linkedUserId" integer,
	"fullName" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuelPrices" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"fuelType" "fuel_type" NOT NULL,
	"priceCents" integer NOT NULL,
	"effectiveAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuelPumps" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"number" varchar(24) NOT NULL,
	"fuelType" "fuel_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuelTanks" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(40) NOT NULL,
	"fuelType" varchar(80) NOT NULL,
	"capacityTotalLiters" numeric(14, 3) NOT NULL,
	"operationalCapacityLiters" numeric(14, 3) NOT NULL,
	"minimumStockLiters" numeric(14, 3) NOT NULL,
	"initialStockLiters" numeric(14, 3) NOT NULL,
	"stockStartDate" varchar(10) NOT NULL,
	"replenishmentLeadDays" integer DEFAULT 0 NOT NULL,
	"safetyReserveLiters" numeric(14, 3) DEFAULT '0' NOT NULL,
	"nearMinimumPercent" integer DEFAULT 15 NOT NULL,
	"autonomyWarningDays" integer DEFAULT 3 NOT NULL,
	"autonomyCriticalDays" integer DEFAULT 2 NOT NULL,
	"discrepancyAlertPercent" numeric(9, 3) DEFAULT '2' NOT NULL,
	"staleAfterDays" integer DEFAULT 7 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"lastSuppliedAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payrollAdjustmentReviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"caseId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"closureRevision" integer DEFAULT 1 NOT NULL,
	"referenceMonth" varchar(7) NOT NULL,
	"originalAmountCents" integer NOT NULL,
	"approvedAmountCents" integer,
	"justification" text NOT NULL,
	"status" "payroll_review_status" DEFAULT 'aguardando_analise' NOT NULL,
	"approvalBy" integer,
	"approvedAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stockMovements" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"tankId" integer NOT NULL,
	"movementType" "stock_movement_type" NOT NULL,
	"quantityLiters" numeric(14, 3) NOT NULL,
	"sourceKey" varchar(220) NOT NULL,
	"sourceClosureId" integer,
	"sourcePumpId" integer,
	"supplier" varchar(180),
	"invoiceNumber" varchar(80),
	"acquisitionValueCents" integer,
	"documentKey" varchar(420),
	"notes" text,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stockMovements_sourceKey_unique" UNIQUE("sourceKey")
);
--> statement-breakpoint
CREATE TABLE "tankMeasurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"tankId" integer NOT NULL,
	"physicalLiters" numeric(14, 3) NOT NULL,
	"theoreticalLiters" numeric(14, 3) NOT NULL,
	"differenceLiters" numeric(14, 3) NOT NULL,
	"differencePercent" numeric(9, 3),
	"measuredAt" timestamp with time zone NOT NULL,
	"notes" text,
	"measuredBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tankPumpAssignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"pumpId" integer NOT NULL,
	"tankId" integer NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unitSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"unitId" integer NOT NULL,
	"settingKey" varchar(80) NOT NULL,
	"settingValue" text NOT NULL,
	"updatedBy" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"legalName" varchar(180) NOT NULL,
	"tradeName" varchar(120) NOT NULL,
	"cnpj" varchar(20) NOT NULL,
	"address" varchar(240) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"postalCode" varchar(12) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appSessions" ADD CONSTRAINT "appSessions_userId_appUsers_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."appUsers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appUsers" ADD CONSTRAINT "appUsers_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditEvents" ADD CONSTRAINT "auditEvents_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditEvents" ADD CONSTRAINT "auditEvents_userId_appUsers_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closureNozzles" ADD CONSTRAINT "closureNozzles_closureId_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."closures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closureNozzles" ADD CONSTRAINT "closureNozzles_pumpId_fuelPumps_id_fk" FOREIGN KEY ("pumpId") REFERENCES "public"."fuelPumps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closureParticipants" ADD CONSTRAINT "closureParticipants_closureId_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."closures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closureParticipants" ADD CONSTRAINT "closureParticipants_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closurePayments" ADD CONSTRAINT "closurePayments_closureId_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."closures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancyAllocations" ADD CONSTRAINT "discrepancyAllocations_caseId_discrepancyCases_id_fk" FOREIGN KEY ("caseId") REFERENCES "public"."discrepancyCases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancyAllocations" ADD CONSTRAINT "discrepancyAllocations_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancyCases" ADD CONSTRAINT "discrepancyCases_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancyCases" ADD CONSTRAINT "discrepancyCases_closureId_closures_id_fk" FOREIGN KEY ("closureId") REFERENCES "public"."closures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancyCases" ADD CONSTRAINT "discrepancyCases_decisionBy_appUsers_id_fk" FOREIGN KEY ("decisionBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_linkedUserId_appUsers_id_fk" FOREIGN KEY ("linkedUserId") REFERENCES "public"."appUsers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuelPrices" ADD CONSTRAINT "fuelPrices_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuelPrices" ADD CONSTRAINT "fuelPrices_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuelPumps" ADD CONSTRAINT "fuelPumps_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuelTanks" ADD CONSTRAINT "fuelTanks_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuelTanks" ADD CONSTRAINT "fuelTanks_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrollAdjustmentReviews" ADD CONSTRAINT "payrollAdjustmentReviews_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrollAdjustmentReviews" ADD CONSTRAINT "payrollAdjustmentReviews_caseId_discrepancyCases_id_fk" FOREIGN KEY ("caseId") REFERENCES "public"."discrepancyCases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrollAdjustmentReviews" ADD CONSTRAINT "payrollAdjustmentReviews_employeeId_employees_id_fk" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrollAdjustmentReviews" ADD CONSTRAINT "payrollAdjustmentReviews_approvalBy_appUsers_id_fk" FOREIGN KEY ("approvalBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrollAdjustmentReviews" ADD CONSTRAINT "payrollAdjustmentReviews_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_tankId_fuelTanks_id_fk" FOREIGN KEY ("tankId") REFERENCES "public"."fuelTanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_sourceClosureId_closures_id_fk" FOREIGN KEY ("sourceClosureId") REFERENCES "public"."closures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_sourcePumpId_fuelPumps_id_fk" FOREIGN KEY ("sourcePumpId") REFERENCES "public"."fuelPumps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockMovements" ADD CONSTRAINT "stockMovements_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankMeasurements" ADD CONSTRAINT "tankMeasurements_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankMeasurements" ADD CONSTRAINT "tankMeasurements_tankId_fuelTanks_id_fk" FOREIGN KEY ("tankId") REFERENCES "public"."fuelTanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankMeasurements" ADD CONSTRAINT "tankMeasurements_measuredBy_appUsers_id_fk" FOREIGN KEY ("measuredBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankPumpAssignments" ADD CONSTRAINT "tankPumpAssignments_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankPumpAssignments" ADD CONSTRAINT "tankPumpAssignments_pumpId_fuelPumps_id_fk" FOREIGN KEY ("pumpId") REFERENCES "public"."fuelPumps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankPumpAssignments" ADD CONSTRAINT "tankPumpAssignments_tankId_fuelTanks_id_fk" FOREIGN KEY ("tankId") REFERENCES "public"."fuelTanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tankPumpAssignments" ADD CONSTRAINT "tankPumpAssignments_createdBy_appUsers_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitSettings" ADD CONSTRAINT "unitSettings_unitId_units_id_fk" FOREIGN KEY ("unitId") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unitSettings" ADD CONSTRAINT "unitSettings_updatedBy_appUsers_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."appUsers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appSessions_user_idx" ON "appSessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "appUsers_unit_idx" ON "appUsers" USING btree ("unitId");--> statement-breakpoint
CREATE INDEX "audit_unit_created_idx" ON "auditEvents" USING btree ("unitId","createdAt");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "auditEvents" USING btree ("targetType","targetId");--> statement-breakpoint
CREATE INDEX "nozzle_closure_idx" ON "closureNozzles" USING btree ("closureId");--> statement-breakpoint
CREATE UNIQUE INDEX "closure_participant_unique" ON "closureParticipants" USING btree ("closureId","employeeId");--> statement-breakpoint
CREATE INDEX "closure_participant_employee_idx" ON "closureParticipants" USING btree ("employeeId","closureId");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_closure_method_unique" ON "closurePayments" USING btree ("closureId","method");--> statement-breakpoint
CREATE UNIQUE INDEX "closure_unit_date_shift_unique" ON "closures" USING btree ("unitId","closureDate","shift");--> statement-breakpoint
CREATE INDEX "closure_date_idx" ON "closures" USING btree ("unitId","closureDate");--> statement-breakpoint
CREATE INDEX "closure_employee_idx" ON "closures" USING btree ("employeeId");--> statement-breakpoint
CREATE UNIQUE INDEX "discrepancy_allocation_revision_unique" ON "discrepancyAllocations" USING btree ("caseId","closureRevision","employeeId");--> statement-breakpoint
CREATE INDEX "discrepancy_allocation_employee_idx" ON "discrepancyAllocations" USING btree ("employeeId","caseId");--> statement-breakpoint
CREATE UNIQUE INDEX "discrepancy_closure_unique" ON "discrepancyCases" USING btree ("closureId");--> statement-breakpoint
CREATE INDEX "discrepancy_unit_status_idx" ON "discrepancyCases" USING btree ("unitId","status");--> statement-breakpoint
CREATE INDEX "employees_unit_idx" ON "employees" USING btree ("unitId");--> statement-breakpoint
CREATE INDEX "employees_linked_user_idx" ON "employees" USING btree ("linkedUserId");--> statement-breakpoint
CREATE INDEX "fuel_price_lookup_idx" ON "fuelPrices" USING btree ("unitId","fuelType","effectiveAt");--> statement-breakpoint
CREATE UNIQUE INDEX "pump_unit_number_unique" ON "fuelPumps" USING btree ("unitId","number");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_tank_unit_code_unique" ON "fuelTanks" USING btree ("unitId","code");--> statement-breakpoint
CREATE INDEX "fuel_tank_unit_active_idx" ON "fuelTanks" USING btree ("unitId","active");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_review_case_employee_revision_unique" ON "payrollAdjustmentReviews" USING btree ("caseId","employeeId","closureRevision");--> statement-breakpoint
CREATE INDEX "payroll_review_unit_month_idx" ON "payrollAdjustmentReviews" USING btree ("unitId","referenceMonth");--> statement-breakpoint
CREATE INDEX "payroll_review_case_idx" ON "payrollAdjustmentReviews" USING btree ("caseId");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movement_invoice_unique" ON "stockMovements" USING btree ("unitId","tankId","invoiceNumber");--> statement-breakpoint
CREATE INDEX "stock_movement_tank_time_idx" ON "stockMovements" USING btree ("unitId","tankId","occurredAt");--> statement-breakpoint
CREATE INDEX "stock_movement_closure_pump_idx" ON "stockMovements" USING btree ("sourceClosureId","sourcePumpId");--> statement-breakpoint
CREATE INDEX "tank_measurement_latest_idx" ON "tankMeasurements" USING btree ("unitId","tankId","measuredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "tank_pump_one_assignment_unique" ON "tankPumpAssignments" USING btree ("pumpId");--> statement-breakpoint
CREATE INDEX "tank_assignment_unit_idx" ON "tankPumpAssignments" USING btree ("unitId","tankId");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_setting_unique" ON "unitSettings" USING btree ("unitId","settingKey");

-- Triggers manuais: Drizzle Kit não representa triggers no schema TypeScript.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "employees_set_updated_at" ON "employees";--> statement-breakpoint
CREATE TRIGGER "employees_set_updated_at" BEFORE UPDATE ON "employees" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "closures_set_updated_at" ON "closures";--> statement-breakpoint
CREATE TRIGGER "closures_set_updated_at" BEFORE UPDATE ON "closures" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "fuelTanks_set_updated_at" ON "fuelTanks";--> statement-breakpoint
CREATE TRIGGER "fuelTanks_set_updated_at" BEFORE UPDATE ON "fuelTanks" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "discrepancyCases_set_updated_at" ON "discrepancyCases";--> statement-breakpoint
CREATE TRIGGER "discrepancyCases_set_updated_at" BEFORE UPDATE ON "discrepancyCases" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "payrollAdjustmentReviews_set_updated_at" ON "payrollAdjustmentReviews";--> statement-breakpoint
CREATE TRIGGER "payrollAdjustmentReviews_set_updated_at" BEFORE UPDATE ON "payrollAdjustmentReviews" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "unitSettings_set_updated_at" ON "unitSettings";--> statement-breakpoint
CREATE TRIGGER "unitSettings_set_updated_at" BEFORE UPDATE ON "unitSettings" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
