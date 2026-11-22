import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// Legacy template table kept intact; app authentication uses appUsers below.
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const units = mysqlTable("units", {
  id: int("id").autoincrement().primaryKey(),
  legalName: varchar("legalName", { length: 180 }).notNull(),
  tradeName: varchar("tradeName", { length: 120 }).notNull(),
  cnpj: varchar("cnpj", { length: 20 }).notNull(),
  address: varchar("address", { length: 240 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  postalCode: varchar("postalCode", { length: 12 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appUsers = mysqlTable(
  "appUsers",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    username: varchar("username", { length: 48 }).notNull().unique(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["frentista", "gerente", "administrador"])
      .default("frentista")
      .notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastLoginAt: timestamp("lastLoginAt"),
  },
  t => [index("appUsers_unit_idx").on(t.unitId)]
);

export const appSessions = mysqlTable(
  "appSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
    csrfToken: varchar("csrfToken", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("appSessions_user_idx").on(t.userId)]
);

export const employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    linkedUserId: int("linkedUserId").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("employees_unit_idx").on(t.unitId),
    index("employees_linked_user_idx").on(t.linkedUserId),
  ]
);

export const fuelPumps = mysqlTable(
  "fuelPumps",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    number: varchar("number", { length: 24 }).notNull(),
    fuelType: mysqlEnum("fuelType", ["gasolina_comum", "diesel_s10"]).notNull(),
    active: boolean("active").default(true).notNull(),
  },
  t => [uniqueIndex("pump_unit_number_unique").on(t.unitId, t.number)]
);

export const fuelPrices = mysqlTable(
  "fuelPrices",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    fuelType: mysqlEnum("fuelType", ["gasolina_comum", "diesel_s10"]).notNull(),
    priceCents: int("priceCents").notNull(),
    effectiveAt: timestamp("effectiveAt").defaultNow().notNull(),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
  },
  t => [index("fuel_price_lookup_idx").on(t.unitId, t.fuelType, t.effectiveAt)]
);

export const unitSettings = mysqlTable(
  "unitSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    settingKey: varchar("settingKey", { length: 80 }).notNull(),
    settingValue: text("settingValue").notNull(),
    updatedBy: int("updatedBy").references(() => appUsers.id),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [uniqueIndex("unit_setting_unique").on(t.unitId, t.settingKey)]
);

export const closures = mysqlTable(
  "closures",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    closureDate: varchar("closureDate", { length: 10 }).notNull(),
    shift: mysqlEnum("shift", ["manha", "tarde", "noite"]).notNull(),
    employeeId: int("employeeId")
      .notNull()
      .references(() => employees.id),
    responsibleName: varchar("responsibleName", { length: 160 }).notNull(),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
    status: mysqlEnum("status", [
      "rascunho",
      "aguardando_conferencia",
      "finalizado",
      "reaberto",
    ])
      .default("rascunho")
      .notNull(),
    result: mysqlEnum("result", ["pendente", "conferido", "sobra", "falta"])
      .default("pendente")
      .notNull(),
    salesCents: int("salesCents").default(0).notNull(),
    receivedCents: int("receivedCents").default(0).notNull(),
    differenceCents: int("differenceCents").default(0).notNull(),
    toleranceCents: int("toleranceCents").default(0).notNull(),
    notes: text("notes"),
    employeeConfirmed: boolean("employeeConfirmed").default(false).notNull(),
    responsibleConfirmed: boolean("responsibleConfirmed")
      .default(false)
      .notNull(),
    finalizedAt: timestamp("finalizedAt"),
    reopenedAt: timestamp("reopenedAt"),
    revision: int("revision").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const closureNozzles = mysqlTable(
  "closureNozzles",
  {
    id: int("id").autoincrement().primaryKey(),
    closureId: int("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    pumpId: int("pumpId")
      .notNull()
      .references(() => fuelPumps.id),
    pumpNumber: varchar("pumpNumber", { length: 24 }).notNull(),
    fuelType: mysqlEnum("fuelType", ["gasolina_comum", "diesel_s10"]).notNull(),
    initialReading: decimal("initialReading", {
      precision: 14,
      scale: 3,
    }).notNull(),
    finalReading: decimal("finalReading", {
      precision: 14,
      scale: 3,
    }).notNull(),
    liters: decimal("liters", { precision: 14, scale: 3 }).notNull(),
    priceCents: int("priceCents").notNull(),
    valueCents: int("valueCents").notNull(),
  },
  t => [index("nozzle_closure_idx").on(t.closureId)]
);

export const closurePayments = mysqlTable(
  "closurePayments",
  {
    id: int("id").autoincrement().primaryKey(),
    closureId: int("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    method: mysqlEnum("method", [
      "dinheiro",
      "pix",
      "debito",
      "credito",
    ]).notNull(),
    amountCents: int("amountCents").notNull(),
  },
  t => [uniqueIndex("payment_closure_method_unique").on(t.closureId, t.method)]
);

export const auditEvents = mysqlTable(
  "auditEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    userId: int("userId")
      .notNull()
      .references(() => appUsers.id),
    targetType: varchar("targetType", { length: 40 }).notNull(),
    targetId: int("targetId").notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    field: varchar("field", { length: 80 }),
    beforeValue: text("beforeValue"),
    afterValue: text("afterValue"),
    reason: text("reason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("audit_unit_created_idx").on(t.unitId, t.createdAt),
    index("audit_target_idx").on(t.targetType, t.targetId),
  ]
);

export const fuelTanks = mysqlTable(
  "fuelTanks",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 40 }).notNull(),
    fuelType: varchar("fuelType", { length: 80 }).notNull(),
    capacityTotalLiters: decimal("capacityTotalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    operationalCapacityLiters: decimal("operationalCapacityLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    minimumStockLiters: decimal("minimumStockLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    initialStockLiters: decimal("initialStockLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    stockStartDate: varchar("stockStartDate", { length: 10 }).notNull(),
    replenishmentLeadDays: int("replenishmentLeadDays").default(0).notNull(),
    safetyReserveLiters: decimal("safetyReserveLiters", {
      precision: 14,
      scale: 3,
    })
      .default("0")
      .notNull(),
    nearMinimumPercent: int("nearMinimumPercent").default(15).notNull(),
    autonomyWarningDays: int("autonomyWarningDays").default(3).notNull(),
    autonomyCriticalDays: int("autonomyCriticalDays").default(2).notNull(),
    discrepancyAlertPercent: decimal("discrepancyAlertPercent", {
      precision: 9,
      scale: 3,
    })
      .default("2")
      .notNull(),
    staleAfterDays: int("staleAfterDays").default(7).notNull(),
    active: boolean("active").default(true).notNull(),
    lastSuppliedAt: timestamp("lastSuppliedAt"),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("fuel_tank_unit_code_unique").on(t.unitId, t.code),
    index("fuel_tank_unit_active_idx").on(t.unitId, t.active),
  ]
);

export const tankPumpAssignments = mysqlTable(
  "tankPumpAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    pumpId: int("pumpId")
      .notNull()
      .references(() => fuelPumps.id),
    tankId: int("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("tank_pump_one_assignment_unique").on(t.pumpId),
    index("tank_assignment_unit_idx").on(t.unitId, t.tankId),
  ]
);

export const stockMovements = mysqlTable(
  "stockMovements",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    tankId: int("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    movementType: mysqlEnum("movementType", [
      "opening",
      "receipt",
      "sale",
      "writeoff",
      "correction",
    ]).notNull(),
    quantityLiters: decimal("quantityLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    sourceKey: varchar("sourceKey", { length: 220 }).notNull().unique(),
    sourceClosureId: int("sourceClosureId").references(() => closures.id),
    sourcePumpId: int("sourcePumpId").references(() => fuelPumps.id),
    supplier: varchar("supplier", { length: 180 }),
    invoiceNumber: varchar("invoiceNumber", { length: 80 }),
    acquisitionValueCents: int("acquisitionValueCents"),
    documentKey: varchar("documentKey", { length: 420 }),
    notes: text("notes"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
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

export const tankMeasurements = mysqlTable(
  "tankMeasurements",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    tankId: int("tankId")
      .notNull()
      .references(() => fuelTanks.id),
    physicalLiters: decimal("physicalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    theoreticalLiters: decimal("theoreticalLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differenceLiters: decimal("differenceLiters", {
      precision: 14,
      scale: 3,
    }).notNull(),
    differencePercent: decimal("differencePercent", { precision: 9, scale: 3 }),
    measuredAt: timestamp("measuredAt").notNull(),
    notes: text("notes"),
    measuredBy: int("measuredBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("tank_measurement_latest_idx").on(t.unitId, t.tankId, t.measuredAt),
  ]
);

export const closureParticipants = mysqlTable(
  "closureParticipants",
  {
    id: int("id").autoincrement().primaryKey(),
    closureId: int("closureId")
      .notNull()
      .references(() => closures.id, { onDelete: "cascade" }),
    employeeId: int("employeeId")
      .notNull()
      .references(() => employees.id),
    sharePercent: int("sharePercent").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("closure_participant_unique").on(t.closureId, t.employeeId),
    index("closure_participant_employee_idx").on(t.employeeId, t.closureId),
  ]
);

export const discrepancyCases = mysqlTable(
  "discrepancyCases",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    closureId: int("closureId")
      .notNull()
      .references(() => closures.id),
    closureRevision: int("closureRevision").notNull(),
    type: mysqlEnum("type", ["sobra", "falta"]).notNull(),
    amountCents: int("amountCents").notNull(),
    status: mysqlEnum("status", [
      "pendente_analise",
      "em_investigacao",
      "justificada",
      "encerrada_sem_desconto",
      "encaminhada_administrativo",
      "resolvida",
      "cancelada_por_correcao",
    ])
      .default("pendente_analise")
      .notNull(),
    justification: text("justification"),
    reviewNotes: text("reviewNotes"),
    evidenceKey: varchar("evidenceKey", { length: 420 }),
    decisionBy: int("decisionBy").references(() => appUsers.id),
    decisionAt: timestamp("decisionAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    uniqueIndex("discrepancy_closure_unique").on(t.closureId),
    index("discrepancy_unit_status_idx").on(t.unitId, t.status),
  ]
);

export const discrepancyAllocations = mysqlTable(
  "discrepancyAllocations",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId")
      .notNull()
      .references(() => discrepancyCases.id),
    employeeId: int("employeeId")
      .notNull()
      .references(() => employees.id),
    closureRevision: int("closureRevision").notNull(),
    allocatedCents: int("allocatedCents").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
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

export const payrollAdjustmentReviews = mysqlTable(
  "payrollAdjustmentReviews",
  {
    id: int("id").autoincrement().primaryKey(),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id),
    caseId: int("caseId")
      .notNull()
      .references(() => discrepancyCases.id),
    employeeId: int("employeeId")
      .notNull()
      .references(() => employees.id),
    closureRevision: int("closureRevision").default(1).notNull(),
    referenceMonth: varchar("referenceMonth", { length: 7 }).notNull(),
    originalAmountCents: int("originalAmountCents").notNull(),
    approvedAmountCents: int("approvedAmountCents"),
    justification: text("justification").notNull(),
    status: mysqlEnum("status", [
      "nao_elegivel",
      "aguardando_analise",
      "aguardando_autorizacao",
      "aprovado",
      "rejeitado",
      "encaminhado_folha",
      "processado",
    ])
      .default("aguardando_analise")
      .notNull(),
    approvalBy: int("approvalBy").references(() => appUsers.id),
    approvedAt: timestamp("approvedAt"),
    createdBy: int("createdBy")
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AppUser = typeof appUsers.$inferSelect;
export type AppSession = typeof appSessions.$inferSelect;
