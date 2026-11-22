import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const app_user_role = pgEnum("app_user_role", [
  "frentista",
  "gerente",
  "administrador",
]);
export const fuel_type = pgEnum("fuel_type", ["gasolina_comum", "diesel_s10"]);
export const closure_shift = pgEnum("closure_shift", ["manha", "tarde", "noite"]);
export const closure_status = pgEnum("closure_status", [
  "rascunho",
  "aguardando_conferencia",
  "finalizado",
  "reaberto",
]);
export const closure_result = pgEnum("closure_result", [
  "pendente",
  "conferido",
  "sobra",
  "falta",
]);
export const payment_method = pgEnum("payment_method", [
  "dinheiro",
  "pix",
  "debito",
  "credito",
]);
export const stock_movement_type = pgEnum("stock_movement_type", [
  "opening",
  "receipt",
  "sale",
  "writeoff",
  "correction",
]);
export const discrepancy_type = pgEnum("discrepancy_type", ["sobra", "falta"]);
export const discrepancy_status = pgEnum("discrepancy_status", [
  "pendente_analise",
  "em_investigacao",
  "justificada",
  "encerrada_sem_desconto",
  "encaminhada_administrativo",
  "resolvida",
  "cancelada_por_correcao",
]);
export const payroll_review_status = pgEnum("payroll_review_status", [
  "nao_elegivel",
  "aguardando_analise",
  "aguardando_autorizacao",
  "aprovado",
  "rejeitado",
  "encaminhado_folha",
  "processado",
]);

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  legalName: varchar("legalName", { length: 180 }).notNull(),
  tradeName: varchar("tradeName", { length: 120 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }).notNull(),
  address: varchar("address", { length: 240 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  postalCode: varchar("postalCode", { length: 12 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const appUsers = pgTable(
  "appUsers",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    username: varchar("username", { length: 48 }).notNull().unique(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    role: app_user_role("role").default("frentista").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastLoginAt: timestamp("lastLoginAt", { withTimezone: true, mode: "date" }),
  },
  t => [index("appUsers_unit_idx").on(t.unitId)]
);

export const appSessions = pgTable(
  "appSessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    csrfToken: varchar("csrfToken", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revokedAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [index("appSessions_user_idx").on(t.userId)]
);

export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    linkedUserId: integer("linkedUserId").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    index("employees_unit_idx").on(t.unitId),
    index("employees_linked_user_idx").on(t.linkedUserId),
  ]
);

export const fuelPumps = pgTable(
  "fuelPumps",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    number: varchar("number", { length: 24 }).notNull(),
    fuelType: fuel_type("fuelType").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  t => [uniqueIndex("pump_unit_number_unique").on(t.unitId, t.number)]
);

export const fuelPrices = pgTable(
  "fuelPrices",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    fuelType: fuel_type("fuelType").notNull(),
    priceCents: integer("priceCents").notNull(),
    effectiveAt: timestamp("effectiveAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
  },
  t => [index("fuel_price_lookup_idx").on(t.unitId, t.fuelType, t.effectiveAt)]
);

export const unitSettings = pgTable(
  "unitSettings",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    settingKey: varchar("settingKey", { length: 80 }).notNull(),
    settingValue: text("settingValue").notNull(),
    updatedBy: integer("updatedBy").references(() => appUsers.id),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [uniqueIndex("unit_setting_unique").on(t.unitId, t.settingKey)]
);

export const closures = pgTable(
  "closures",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    closureDate: varchar("closureDate", { length: 10 }).notNull(),
    shift: closure_shift("shift").notNull(),
    employeeId: integer("employeeId")
      .notNull()
      .references(() => employees.id),
    responsibleName: varchar("responsibleName", { length: 160 }).notNull(),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
    status: closure_status("status").default("rascunho").notNull(),
    result: closure_result("result").default("pendente").notNull(),
    salesCents: integer("salesCents").default(0).notNull(),
    receivedCents: integer("receivedCents").default(0).notNull(),
    differenceCents: integer("differenceCents").default(0).notNull(),
    toleranceCents: integer("toleranceCents").default(0).notNull(),
    notes: text("notes"),
    employeeConfirmed: boolean("employeeConfirmed").default(false).notNull(),
    responsibleConfirmed: boolean("responsibleConfirmed")
      .default(false)
      .notNull(),
    finalizedAt: timestamp("finalizedAt", { withTimezone: true, mode: "date" }),
    reopenedAt: timestamp("reopenedAt", { withTimezone: true, mode: "date" }),
    revision: integer("revision").default(1).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("closure_unit_date_shift_unique").on(
      t.unitId,
      t.closureDate,
      t.shift
    ),
    index("closure_date_idx").on(t.unitId, t.closureDate),
    index("closure_employee_idx").on(t.employeeId),
  ]
);

export const closureNozzles = pgTable(
  "closureNozzles",
  {
    id: serial("id").primaryKey(),
    closureId: integer("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    pumpId: integer("pumpId")
      .notNull()
      .references(() => fuelPumps.id),
    pumpNumber: varchar("pumpNumber", { length: 24 }).notNull(),
    fuelType: fuel_type("fuelType").notNull(),
    initialReading: numeric("initialReading", {
      precision: 14,
      scale: 3,
    }).notNull(),
    finalReading: numeric("finalReading", {
      precision: 14,
      scale: 3,
    }).notNull(),
    liters: numeric("liters", { precision: 14, scale: 3 }).notNull(),
    priceCents: integer("priceCents").notNull(),
    valueCents: integer("valueCents").notNull(),
  },
  t => [index("nozzle_closure_idx").on(t.closureId)]
);

export const closurePayments = pgTable(
  "closurePayments",
  {
    id: serial("id").primaryKey(),
    closureId: integer("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    method: payment_method("method").notNull(),
    amountCents: integer("amountCents").notNull(),
  },
  t => [uniqueIndex("payment_closure_method_unique").on(t.closureId, t.method)]
);

export const auditEvents = pgTable(
  "auditEvents",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    userId: integer("userId")
      .notNull()
      .references(() => appUsers.id),
    targetType: varchar("targetType", { length: 40 }).notNull(),
    targetId: integer("targetId").notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    field: varchar("field", { length: 80 }),
    beforeValue: text("beforeValue"),
    afterValue: text("afterValue"),
    reason: text("reason"),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    index("audit_unit_created_idx").on(t.unitId, t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ]
);

export const fuelTanks = pgTable(
  "fuelTanks",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    fuelType: varchar("fuelType", { length: 80 }).notNull(),
    capacityTotalLiters: numeric("capacityTotalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    operationalCapacityLiters: numeric("operationalCapacityLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    minimumStockLiters: numeric("minimumStockLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    initialStockLiters: numeric("initialStockLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    stockStartDate: varchar("stockStartDate", { length: 10 }).notNull(),
    replenishmentLeadDays: integer("replenishmentLeadDays")
      .default(0)
      .notNull(),
    safetyReserveLiters: numeric("safetyReserveLiters", {
      precision: 14,
      scale: 3,
    })
      .default("0")
      .notNull(),
    nearMinimumPercent: integer("nearMinimumPercent").default(15).notNull(),
    autonomyWarningDays: integer("autonomyWarningDays").default(3).notNull(),
    autonomyCriticalDays: integer("autonomyCriticalDays").default(2).notNull(),
    discrepancyAlertPercent: numeric("discrepancyAlertPercent", {
      precision: 9,
      scale: 3,
    })
      .default("2")
      .notNull(),
    staleAfterDays: integer("staleAfterDays").default(7).notNull(),
    active: boolean("active").default(true).notNull(),
    lastSuppliedAt: timestamp("lastSuppliedAt", { withTimezone: true, mode: "date" }),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("fuel_tank_unit_code_unique").on(t.unitId, t.code),
    index("fuel_tank_unit_active_idx").on(t.unitId, t.active),
  ]
);

export const tankPumpAssignments = pgTable(
  "tankPumpAssignments",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    pumpId: integer("pumpId")
      .notNull()
      .references(() => fuelPumps.id),
    tankId: integer("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("tank_pump_one_assignment_unique").on(t.pumpId),
    index("tank_assignment_unit_idx").on(t.unitId, t.tankId),
  ]
);

export const stockMovements = pgTable(
  "stockMovements",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    tankId: integer("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    movementType: stock_movement_type("movementType").notNull(),
    quantityLiters: numeric("quantityLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    sourceKey: varchar("sourceKey", { length: 220 }).notNull().unique(),
    sourceClosureId: integer("sourceClosureId").references(() => closures.id),
    sourcePumpId: integer("sourcePumpId").references(() => fuelPumps.id),
    supplier: varchar("supplier", { length: 180 }),
    invoiceNumber: varchar("invoiceNumber", { length: 80 }),
    acquisitionValueCents: integer("acquisitionValueCents"),
    documentKey: varchar("documentKey", { length: 420 }),
    notes: text("notes"),
    occurredAt: timestamp("occurredAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("stock_movement_invoice_unique").on(
      t.unitId,
      t.tankId,
      t.invoiceNumber
    ),
    index("stock_movement_tank_time_idx").on(t.unitId, t.tankId, t.occurredAt),
    index("stock_movement_closure_pump_idx").on(
      t.sourceClosureId,
      t.sourcePumpId
    ),
  ]
);

export const tankMeasurements = pgTable(
  "tankMeasurements",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    tankId: integer("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    physicalLiters: numeric("physicalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    theoreticalLiters: numeric("theoreticalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differenceLiters: numeric("differenceLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differencePercent: numeric("differencePercent", { precision: 9, scale: 3 }),
    measuredAt: timestamp("measuredAt", { withTimezone: true, mode: "date" }).notNull(),
    notes: text("notes"),
    measuredBy: integer("measuredBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    index("tank_measurement_latest_idx").on(t.unitId, t.tankId, t.measuredAt),
  ]
);

export const closureParticipants = pgTable(
  "closureParticipants",
  {
    id: serial("id").primaryKey(),
    closureId: integer("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    employeeId: integer("employeeId")
      .notNull()
      .references(() => employees.id),
    sharePercent: integer("sharePercent").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("closure_participant_unique").on(t.closureId, t.employeeId),
    index("closure_participant_employee_idx").on(t.employeeId, t.closureId),
  ]
);

export const discrepancyCases = pgTable(
  "discrepancyCases",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    closureId: integer("closureId")
      .notNull()
      .references(() => closures.id),
    closureRevision: integer("closureRevision").notNull(),
    type: discrepancy_type("type").notNull(),
    amountCents: integer("amountCents").notNull(),
    status: discrepancy_status("status").default("pendente_analise").notNull(),
    justification: text("justification"),
    reviewNotes: text("reviewNotes"),
    evidenceKey: varchar("evidenceKey", { length: 420 }),
    decisionBy: integer("decisionBy").references(() => appUsers.id),
    decisionAt: timestamp("decisionAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("discrepancy_closure_unique").on(t.closureId),
    index("discrepancy_unit_status_idx").on(t.unitId, t.status),
  ]
);

export const discrepancyAllocations = pgTable(
  "discrepancyAllocations",
  {
    id: serial("id").primaryKey(),
    caseId: integer("caseId")
      .notNull()
      .references(() => discrepancyCases.id),
    employeeId: integer("employeeId")
      .notNull()
      .references(() => employees.id),
    closureRevision: integer("closureRevision").notNull(),
    allocatedCents: integer("allocatedCents").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("discrepancy_allocation_revision_unique").on(
      t.caseId,
      t.closureRevision,
      t.employeeId
    ),
    index("discrepancy_allocation_employee_idx").on(t.employeeId, t.caseId),
  ]
);

export const payrollAdjustmentReviews = pgTable(
  "payrollAdjustmentReviews",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unitId")
      .notNull()
      .references(() => units.id),
    caseId: integer("caseId")
      .notNull()
      .references(() => discrepancyCases.id),
    employeeId: integer("employeeId")
      .notNull()
      .references(() => employees.id),
    closureRevision: integer("closureRevision").default(1).notNull(),
    referenceMonth: varchar("referenceMonth", { length: 7 }).notNull(),
    originalAmountCents: integer("originalAmountCents").notNull(),
    approvedAmountCents: integer("approvedAmountCents"),
    justification: text("justification").notNull(),
    status: payroll_review_status("status")
      .default("aguardando_analise")
      .notNull(),
    approvalBy: integer("approvalBy").references(() => appUsers.id),
    approvedAt: timestamp("approvedAt", { withTimezone: true, mode: "date" }),
    createdBy: integer("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex("payroll_review_case_employee_revision_unique").on(
      t.caseId,
      t.employeeId,
      t.closureRevision
    ),
    index("payroll_review_unit_month_idx").on(t.unitId, t.referenceMonth),
    index("payroll_review_case_idx").on(t.caseId),
  ]
);

export type AppUser = typeof appUsers.$inferSelect;
export type AppSession = typeof appSessions.$inferSelect;
