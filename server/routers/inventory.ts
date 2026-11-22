import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  appUsers,
  auditEvents,
  closures,
  closureNozzles,
  employees,
  fuelPumps,
  fuelTanks,
  stockMovements,
  tankMeasurements,
  tankPumpAssignments,
} from "../../drizzle/schema.pg";
import {
  businessDateInSaoPaulo,
  isValidCalendarDate,
  shiftCalendarDate,
} from "../../shared/businessDate";
import { FUEL_TYPES } from "../../shared/fuel";
import {
  autonomyInDays,
  classifyStockHealth,
  roundLiters,
  summarizeTankSalesWindow,
  suggestedReplenishmentLiters,
  type TankAssignmentRecord,
  type TankSalesRecord,
} from "../../shared/inventory";
import { adminProcedure, managerProcedure, router } from "../_core/trpc";

const litersInput = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999)
  .transform(roundLiters);
export const positiveLitersInput = z
  .number()
  .finite()
  .min(0.001, "Use no mínimo 0,001 L.")
  .max(9_999_999)
  .transform(roundLiters);
const dateInput = z
  .string()
  .refine(isValidCalendarDate, "Informe uma data de calendário válida.");
const fuelNameInput = z.enum(FUEL_TYPES);
const safeNumber = (value: unknown) => Number(value ?? 0);

async function logAudit(
  tx: any,
  unitId: number,
  userId: number,
  targetType: string,
  targetId: number,
  action: string,
  reason?: string
) {
  await tx.insert(auditEvents).values({
    unitId,
    userId,
    targetType,
    targetId,
    action,
    reason: reason ?? null,
  });
}

async function movementBalance(executor: any, unitId: number, tankId: number) {
  const rows = await executor
    .select({ quantityLiters: stockMovements.quantityLiters })
    .from(stockMovements)
    .where(
      and(eq(stockMovements.unitId, unitId), eq(stockMovements.tankId, tankId))
    );
  return roundLiters(
    rows.reduce(
      (sum: number, row: any) => sum + safeNumber(row.quantityLiters),
      0
    )
  );
}

async function lockTank(
  executor: any,
  unitId: number,
  tankId: number,
  activeOnly = true
) {
  const conditions = [eq(fuelTanks.id, tankId), eq(fuelTanks.unitId, unitId)];
  if (activeOnly) conditions.push(eq(fuelTanks.active, true));
  const [tank] = await executor
    .select()
    .from(fuelTanks)
    .where(and(...conditions))
    .limit(1)
    .for("update");
  return tank;
}

function maxTimestamp(values: Array<Date | string | null | undefined>) {
  const times = values
    .map(value => (value ? new Date(value).getTime() : 0))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)) : null;
}

export const inventoryRouter = router({
  dashboard: managerProcedure
    .input(
      z
        .object({
          windowDays: z
            .union([z.literal(7), z.literal(15), z.literal(30)])
            .default(7),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const tanks = await db
        .select()
        .from(fuelTanks)
        .where(
          and(eq(fuelTanks.unitId, ctx.user.unitId), eq(fuelTanks.active, true))
        )
        .orderBy(asc(fuelTanks.name), asc(fuelTanks.code));
      if (!tanks.length)
        return {
          configured: false,
          windowDays: input?.windowDays ?? 7,
          tanks: [],
          alerts: [],
        };

      const today = businessDateInSaoPaulo();
      const from30 = shiftCalendarDate(today, -29);
      const [
        movements,
        measurements,
        assignments,
        pumps,
        sales,
        assignmentEvents,
        allTanks,
      ] = await Promise.all([
        db
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.unitId, ctx.user.unitId))
          .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id)),
        db
          .select()
          .from(tankMeasurements)
          .where(eq(tankMeasurements.unitId, ctx.user.unitId))
          .orderBy(
            desc(tankMeasurements.measuredAt),
            desc(tankMeasurements.id)
          ),
        db
          .select()
          .from(tankPumpAssignments)
          .where(eq(tankPumpAssignments.unitId, ctx.user.unitId)),
        db
          .select()
          .from(fuelPumps)
          .where(eq(fuelPumps.unitId, ctx.user.unitId)),
        db
          .select({
            closureId: closures.id,
            pumpId: closureNozzles.pumpId,
            liters: closureNozzles.liters,
            fuelType: closureNozzles.fuelType,
            closureDate: closures.closureDate,
            shift: closures.shift,
            finalizedAt: closures.finalizedAt,
          })
          .from(closureNozzles)
          .innerJoin(closures, eq(closureNozzles.closureId, closures.id))
          .where(
            and(
              eq(closures.unitId, ctx.user.unitId),
              eq(closures.status, "finalizado"),
              gte(closures.closureDate, from30),
              lte(closures.closureDate, today)
            )
          ),
        db
          .select({
            targetId: auditEvents.targetId,
            field: auditEvents.field,
            beforeValue: auditEvents.beforeValue,
            afterValue: auditEvents.afterValue,
            reason: auditEvents.reason,
            createdAt: auditEvents.createdAt,
          })
          .from(auditEvents)
          .where(
            and(
              eq(auditEvents.unitId, ctx.user.unitId),
              eq(auditEvents.targetType, "tank_assignment"),
              eq(auditEvents.action, "assigned")
            )
          )
          .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id)),
        db
          .select({ id: fuelTanks.id, code: fuelTanks.code })
          .from(fuelTanks)
          .where(eq(fuelTanks.unitId, ctx.user.unitId)),
      ]);

      const windowDays = input?.windowDays ?? 7;
      const windowStart = shiftCalendarDate(today, -(windowDays - 1));
      const parseTankId = (value: string | null) => {
        if (!value) return null;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      };
      const history: TankAssignmentRecord[] = [];
      for (const event of assignmentEvents) {
        const pump = pumps.find(item => item.id === event.targetId);
        const effectiveAt = event.createdAt;
        const previousTankId =
          event.field === "tankId" ? parseTankId(event.beforeValue) : null;
        if (previousTankId !== null)
          history.push({
            pumpId: event.targetId,
            tankId: previousTankId,
            effectiveAt: new Date(effectiveAt.getTime() - 1),
          });

        const recordedTankId =
          event.field === "tankId" ? parseTankId(event.afterValue) : null;
        const legacyTank =
          event.field === "tankId" || !pump || !event.reason
            ? undefined
            : allTanks.find(
                tank =>
                  event.reason ===
                  `Bico ${pump.number} vinculado ao tanque ${tank.code}.`
              );
        const tankId = recordedTankId ?? legacyTank?.id ?? null;
        if (tankId !== null)
          history.push({
            pumpId: event.targetId,
            tankId,
            effectiveAt,
          });
      }
      for (const assignment of assignments) {
        history.push({
          pumpId: assignment.pumpId,
          tankId: assignment.tankId,
          effectiveAt: assignment.createdAt,
        });
      }
      const salesRows: TankSalesRecord[] = sales.flatMap(row =>
        row.finalizedAt
          ? [
              {
                ...row,
                finalizedAt: row.finalizedAt,
                liters: safeNumber(row.liters),
              },
            ]
          : []
      );
      const activePumps = pumps.filter(pump => pump.active);
      const activePumpIds = new Set(activePumps.map(pump => pump.id));
      const summaries = tanks.map(tank => {
        const tankMovements = movements.filter(row => row.tankId === tank.id);
        const stockLiters = roundLiters(
          tankMovements.reduce(
            (sum, row) => sum + safeNumber(row.quantityLiters),
            0
          )
        );
        const tankMeasurementsRows = measurements.filter(
          row => row.tankId === tank.id
        );
        const latestMeasurement = tankMeasurementsRows[0] ?? null;
        const latestMovement = tankMovements.length
          ? tankMovements[tankMovements.length - 1]
          : null;
        const lastUpdatedAt = maxTimestamp([
          latestMovement?.occurredAt,
          latestMeasurement?.measuredAt,
        ]);
        const stale =
          !lastUpdatedAt ||
          Date.now() - lastUpdatedAt.getTime() >
            tank.staleAfterDays * 86_400_000;
        const assignedPumpIds = new Set(
          assignments
            .filter(
              item => item.tankId === tank.id && activePumpIds.has(item.pumpId)
            )
            .map(item => item.pumpId)
        );
        const windowSummary = summarizeTankSalesWindow(
          salesRows,
          assignedPumpIds,
          history,
          tank.id,
          tank.fuelType,
          windowStart,
          today,
          tank.stockStartDate
        );
        const { availableDays, relevantSales, averageDailyLiters } =
          windowSummary;
        const autonomyDays = autonomyInDays(stockLiters, averageDailyLiters);
        const physicalDifferencePercent =
          latestMeasurement?.differencePercent == null
            ? null
            : safeNumber(latestMeasurement.differencePercent);
        const stockHealth = classifyStockHealth({
          stockLiters,
          minimumLiters: safeNumber(tank.minimumStockLiters),
          nearMinimumPercent: tank.nearMinimumPercent,
          autonomyDays,
          warningAutonomyDays: tank.autonomyWarningDays,
          criticalAutonomyDays: tank.autonomyCriticalDays,
          stale,
          discrepancyPercent: physicalDifferencePercent,
          discrepancyAlertPercent: safeNumber(tank.discrepancyAlertPercent),
        });
        const dataQuality =
          !assignedPumpIds.size ||
          availableDays < 3 ||
          availableDays < windowDays
            ? ("baixa" as const)
            : ("adequada" as const);
        const daysUntilEmpty =
          autonomyDays === null ? null : Math.ceil(autonomyDays);
        const expectedEmptyDate =
          daysUntilEmpty === null
            ? null
            : shiftCalendarDate(today, daysUntilEmpty);
        const alerts: Array<{
          code: string;
          severity: "atencao" | "critico";
          message: string;
        }> = [];
        if (stockLiters <= safeNumber(tank.minimumStockLiters))
          alerts.push({
            code: "below_minimum",
            severity: "critico",
            message: "Estoque abaixo do mínimo configurado.",
          });
        else if (
          stockLiters <=
          safeNumber(tank.minimumStockLiters) *
            (1 + tank.nearMinimumPercent / 100)
        )
          alerts.push({
            code: "near_minimum",
            severity: "atencao",
            message: "Estoque próximo do mínimo configurado.",
          });
        if (autonomyDays !== null && autonomyDays < tank.autonomyCriticalDays)
          alerts.push({
            code: "autonomy_critical",
            severity: "critico",
            message: `Autonomia inferior a ${tank.autonomyCriticalDays} dias.`,
          });
        else if (
          autonomyDays !== null &&
          autonomyDays < tank.autonomyWarningDays
        )
          alerts.push({
            code: "autonomy_warning",
            severity: "atencao",
            message: `Autonomia inferior a ${tank.autonomyWarningDays} dias.`,
          });
        if (
          physicalDifferencePercent !== null &&
          Math.abs(physicalDifferencePercent) >=
            safeNumber(tank.discrepancyAlertPercent)
        )
          alerts.push({
            code: "physical_difference",
            severity: "atencao",
            message:
              "Medição física diverge do estoque teórico além do limite.",
          });
        if (stale)
          alerts.push({
            code: "stale",
            severity: "atencao",
            message: `Sem atualização recente há mais de ${tank.staleAfterDays} dias.`,
          });
        const pumpsAssigned = assignments
          .filter(
            item => item.tankId === tank.id && activePumpIds.has(item.pumpId)
          )
          .map(item => activePumps.find(pump => pump.id === item.pumpId))
          .filter(Boolean);
        const suggestedLiters =
          averageDailyLiters > 0
            ? suggestedReplenishmentLiters({
                stockLiters,
                operationalCapacityLiters: safeNumber(
                  tank.operationalCapacityLiters
                ),
                minimumLiters: safeNumber(tank.minimumStockLiters),
                averageDailyLiters,
                leadDays: tank.replenishmentLeadDays,
                safetyReserveLiters: safeNumber(tank.safetyReserveLiters),
              })
            : 0;
        return {
          ...tank,
          stockLiters,
          occupiedPercent:
            safeNumber(tank.operationalCapacityLiters) > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    (stockLiters / safeNumber(tank.operationalCapacityLiters)) *
                      100
                  )
                )
              : 0,
          averageDailyLiters,
          averageWindowDays: windowDays,
          averages: [7, 15, 30].map(days => {
            const start = shiftCalendarDate(today, -(days - 1));
            const window = summarizeTankSalesWindow(
              salesRows,
              assignedPumpIds,
              history,
              tank.id,
              tank.fuelType,
              start,
              today,
              tank.stockStartDate
            );
            return {
              days,
              effectiveDays: window.availableDays,
              litersPerDay: window.averageDailyLiters,
              records: window.records,
            };
          }),
          autonomyDays,
          expectedEmptyDate,
          dataQuality,
          stockHealth,
          suggestedReplenishmentLiters: suggestedLiters,
          lastUpdatedAt,
          latestMeasurement: latestMeasurement
            ? {
                ...latestMeasurement,
                physicalLiters: safeNumber(latestMeasurement.physicalLiters),
                theoreticalLiters: safeNumber(
                  latestMeasurement.theoreticalLiters
                ),
                differenceLiters: safeNumber(
                  latestMeasurement.differenceLiters
                ),
                differencePercent: physicalDifferencePercent,
              }
            : null,
          assignedPumps: pumpsAssigned.map(pump => ({
            id: pump!.id,
            number: pump!.number,
            fuelType: pump!.fuelType,
          })),
          alerts,
        };
      });
      return {
        configured: true,
        windowDays,
        tanks: summaries,
        alerts: summaries.flatMap(tank =>
          tank.alerts.map(alert => ({
            ...alert,
            tankId: tank.id,
            tankName: tank.name,
          }))
        ),
      };
    }),

  listTanks: managerProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const [tanks, pumps, assignments] = await Promise.all([
      db
        .select()
        .from(fuelTanks)
        .where(eq(fuelTanks.unitId, ctx.user.unitId))
        .orderBy(asc(fuelTanks.name)),
      db
        .select()
        .from(fuelPumps)
        .where(eq(fuelPumps.unitId, ctx.user.unitId))
        .orderBy(asc(fuelPumps.number)),
      db
        .select()
        .from(tankPumpAssignments)
        .where(eq(tankPumpAssignments.unitId, ctx.user.unitId)),
    ]);
    return tanks.map(tank => ({
      ...tank,
      assignments: assignments
        .filter(a => a.tankId === tank.id)
        .map(a => ({ ...a, pump: pumps.find(p => p.id === a.pumpId) ?? null })),
    }));
  }),

  createTank: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100),
        code: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[A-Za-z0-9._-]+$/),
        fuelType: fuelNameInput,
        capacityTotalLiters: positiveLitersInput,
        operationalCapacityLiters: positiveLitersInput,
        minimumStockLiters: litersInput,
        initialStockLiters: litersInput,
        stockStartDate: dateInput,
        replenishmentLeadDays: z.number().int().min(0).max(90),
        safetyReserveLiters: litersInput,
        nearMinimumPercent: z.number().int().min(0).max(100),
        autonomyWarningDays: z.number().int().min(1).max(30),
        autonomyCriticalDays: z.number().int().min(1).max(30),
        discrepancyAlertPercent: z.number().finite().min(0).max(100),
        staleAfterDays: z.number().int().min(1).max(365),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (
        input.operationalCapacityLiters > input.capacityTotalLiters ||
        input.minimumStockLiters > input.operationalCapacityLiters ||
        input.initialStockLiters > input.operationalCapacityLiters ||
        input.autonomyCriticalDays > input.autonomyWarningDays
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Confira os limites: capacidade operacional ≤ total, estoque mínimo/inicial ≤ capacidade operacional e autonomia crítica ≤ atenção.",
        });
      }
      const db = ctx.db;
      try {
        return await db.transaction(async tx => {
          const [inserted] = await tx
            .insert(fuelTanks)
            .values({
              ...input,
              capacityTotalLiters: input.capacityTotalLiters.toFixed(3),
              operationalCapacityLiters:
                input.operationalCapacityLiters.toFixed(3),
              minimumStockLiters: input.minimumStockLiters.toFixed(3),
              initialStockLiters: input.initialStockLiters.toFixed(3),
              safetyReserveLiters: input.safetyReserveLiters.toFixed(3),
              discrepancyAlertPercent: input.discrepancyAlertPercent.toFixed(3),
              unitId: ctx.user.unitId,
              createdBy: ctx.user.id,
            })
            .returning({ id: fuelTanks.id });
          const id = inserted.id;
          await tx.insert(stockMovements).values({
            unitId: ctx.user.unitId,
            tankId: id,
            movementType: "opening",
            quantityLiters: input.initialStockLiters.toFixed(3),
            sourceKey: `tank:${id}:opening`,
            notes: "Estoque inicial informado no cadastro do tanque.",
            occurredAt: new Date(`${input.stockStartDate}T12:00:00-03:00`),
            createdBy: ctx.user.id,
          });
          await logAudit(
            tx,
            ctx.user.unitId,
            ctx.user.id,
            "fuel_tank",
            id,
            "created",
            "Tanque e estoque inicial cadastrados."
          );
          return { id };
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Não foi possível cadastrar o tanque. Verifique se o código já está em uso.",
        });
      }
    }),

  updateTank: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(2).max(100),
        capacityTotalLiters: positiveLitersInput,
        operationalCapacityLiters: positiveLitersInput,
        minimumStockLiters: litersInput,
        replenishmentLeadDays: z.number().int().min(0).max(90),
        safetyReserveLiters: litersInput,
        nearMinimumPercent: z.number().int().min(0).max(100),
        autonomyWarningDays: z.number().int().min(1).max(30),
        autonomyCriticalDays: z.number().int().min(1).max(30),
        discrepancyAlertPercent: z.number().finite().min(0).max(100),
        staleAfterDays: z.number().int().min(1).max(365),
        active: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (
        input.operationalCapacityLiters > input.capacityTotalLiters ||
        input.minimumStockLiters > input.operationalCapacityLiters ||
        input.autonomyCriticalDays > input.autonomyWarningDays
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os limites informados são incompatíveis.",
        });
      const db = ctx.db;
      await db.transaction(async tx => {
        const tank = await lockTank(tx, ctx.user.unitId, input.id, false);
        if (!tank)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tanque não encontrado.",
          });
        const current = await movementBalance(tx, ctx.user.unitId, tank.id);
        if (current > input.operationalCapacityLiters)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A capacidade operacional não pode ficar abaixo do estoque teórico atual.",
          });
        const { id, ...values } = input;
        await tx
          .update(fuelTanks)
          .set({
            ...values,
            capacityTotalLiters: values.capacityTotalLiters.toFixed(3),
            operationalCapacityLiters:
              values.operationalCapacityLiters.toFixed(3),
            minimumStockLiters: values.minimumStockLiters.toFixed(3),
            safetyReserveLiters: values.safetyReserveLiters.toFixed(3),
            discrepancyAlertPercent: values.discrepancyAlertPercent.toFixed(3),
          })
          .where(
            and(eq(fuelTanks.id, id), eq(fuelTanks.unitId, ctx.user.unitId))
          );
        await logAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "fuel_tank",
          id,
          "updated",
          "Identificação, limites ou status do tanque atualizados."
        );
      });
      return { success: true };
    }),

  assignPump: adminProcedure
    .input(
      z.object({
        pumpId: z.number().int().positive(),
        tankId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [[pump], [tank]] = await Promise.all([
        db
          .select()
          .from(fuelPumps)
          .where(
            and(
              eq(fuelPumps.id, input.pumpId),
              eq(fuelPumps.unitId, ctx.user.unitId),
              eq(fuelPumps.active, true)
            )
          )
          .limit(1),
        db
          .select()
          .from(fuelTanks)
          .where(
            and(
              eq(fuelTanks.id, input.tankId),
              eq(fuelTanks.unitId, ctx.user.unitId),
              eq(fuelTanks.active, true)
            )
          )
          .limit(1),
      ]);
      if (!pump || !tank)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bico ou tanque ativo não encontrado.",
        });
      if (pump.fuelType !== tank.fuelType)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "O combustível do bico precisa corresponder ao combustível do tanque.",
        });
      await db.transaction(async tx => {
        const [current] = await tx
          .select({ tankId: tankPumpAssignments.tankId })
          .from(tankPumpAssignments)
          .where(
            and(
              eq(tankPumpAssignments.unitId, ctx.user.unitId),
              eq(tankPumpAssignments.pumpId, pump.id)
            )
          )
          .for("update");
        if (current?.tankId === tank.id) return;
        const assignedAt = new Date();
        await tx
          .insert(tankPumpAssignments)
          .values({
            unitId: ctx.user.unitId,
            pumpId: pump.id,
            tankId: tank.id,
            createdBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: tankPumpAssignments.pumpId,
            set: {
              tankId: tank.id,
              createdBy: ctx.user.id,
              createdAt: assignedAt,
            },
          });
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "tank_assignment",
          targetId: pump.id,
          action: "assigned",
          field: "tankId",
          beforeValue: current ? String(current.tankId) : null,
          afterValue: String(tank.id),
          reason: `Bico ${pump.number} vinculado ao tanque ${tank.code}.`,
          createdAt: assignedAt,
        });
      });
      return { success: true };
    }),

  createReceipt: managerProcedure
    .input(
      z.object({
        tankId: z.number().int().positive(),
        supplier: z.string().trim().min(2).max(180),
        invoiceNumber: z.string().trim().max(80).optional(),
        occurredAt: z.string().datetime(),
        quantityLiters: positiveLitersInput,
        acquisitionValueCents: z.number().int().positive().max(2_000_000_000),
        idempotencyKey: z.string().uuid(),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const sourceKey = `receipt:${ctx.user.unitId}:${input.idempotencyKey}`;
      const [duplicateKey] = await db
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.sourceKey, sourceKey))
        .limit(1);
      if (duplicateKey) return { id: duplicateKey.id, duplicate: true };
      const invoice = input.invoiceNumber?.trim() || null;
      try {
        const result = await db.transaction(async tx => {
          const tank = await lockTank(tx, ctx.user.unitId, input.tankId, true);
          if (!tank)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Tanque ativo não encontrado.",
            });
          const [duplicate] = await tx
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.sourceKey, sourceKey))
            .limit(1);
          if (duplicate) return { id: duplicate.id, duplicate: true };
          if (invoice) {
            const [sameInvoice] = await tx
              .select({ id: stockMovements.id })
              .from(stockMovements)
              .where(
                and(
                  eq(stockMovements.unitId, ctx.user.unitId),
                  eq(stockMovements.tankId, tank.id),
                  eq(stockMovements.invoiceNumber, invoice)
                )
              )
              .limit(1);
            if (sameInvoice)
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "Esta nota fiscal já foi lançada para o tanque selecionado.",
              });
          }
          const current = await movementBalance(tx, ctx.user.unitId, tank.id);
          if (
            current + input.quantityLiters >
            safeNumber(tank.operationalCapacityLiters)
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "A entrada ultrapassaria a capacidade operacional configurada.",
            });
          const [inserted] = await tx
            .insert(stockMovements)
            .values({
              unitId: ctx.user.unitId,
              tankId: tank.id,
              movementType: "receipt",
              quantityLiters: input.quantityLiters.toFixed(3),
              sourceKey,
              supplier: input.supplier,
              invoiceNumber: invoice,
              acquisitionValueCents: input.acquisitionValueCents,
              notes: input.notes || null,
              occurredAt: new Date(input.occurredAt),
              createdBy: ctx.user.id,
            })
            .returning({ id: stockMovements.id });
          const id = inserted.id;
          if (
            !tank.lastSuppliedAt ||
            new Date(input.occurredAt) > new Date(tank.lastSuppliedAt)
          )
            await tx
              .update(fuelTanks)
              .set({ lastSuppliedAt: new Date(input.occurredAt) })
              .where(eq(fuelTanks.id, tank.id));
          await logAudit(
            tx,
            ctx.user.unitId,
            ctx.user.id,
            "stock_movement",
            id,
            "receipt_created",
            `Entrada de ${input.quantityLiters.toFixed(3)} L no tanque ${tank.code}.`
          );
          return { id, duplicate: false };
        });
        return result;
      } catch (error) {
        const [duplicate] = await db
          .select({ id: stockMovements.id })
          .from(stockMovements)
          .where(eq(stockMovements.sourceKey, sourceKey))
          .limit(1);
        if (duplicate) return { id: duplicate.id, duplicate: true };
        if (invoice) {
          const [tank] = await db
            .select({ id: fuelTanks.id })
            .from(fuelTanks)
            .where(
              and(
                eq(fuelTanks.id, input.tankId),
                eq(fuelTanks.unitId, ctx.user.unitId)
              )
            )
            .limit(1);
          if (tank) {
            const [sameInvoice] = await db
              .select({ id: stockMovements.id })
              .from(stockMovements)
              .where(
                and(
                  eq(stockMovements.unitId, ctx.user.unitId),
                  eq(stockMovements.tankId, tank.id),
                  eq(stockMovements.invoiceNumber, invoice)
                )
              )
              .limit(1);
            if (sameInvoice)
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "Esta nota fiscal já foi lançada para o tanque selecionado.",
              });
          }
        }
        throw error;
      }
    }),

  receiptUploadTarget: managerProcedure
    .input(
      z.object({
        movementId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(180),
        contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        sizeBytes: z.number().int().positive().max(10_485_760),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [movement] = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.id, input.movementId),
            eq(stockMovements.unitId, ctx.user.unitId),
            eq(stockMovements.movementType, "receipt")
          )
        )
        .limit(1);
      if (!movement)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entrada não encontrada.",
        });
      if (!ctx.env.R2)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "O armazenamento seguro de comprovantes não está disponível.",
        });
      const extension =
        input.contentType === "application/pdf"
          ? "pdf"
          : input.contentType === "image/png"
            ? "png"
            : "jpg";
      const key = `fuel-receipts/${ctx.user.unitId}/${movement.id}/${crypto.randomUUID()}.${extension}`;
      return {
        key,
        uploadUrl: `/api/files/${key}`,
        contentType: input.contentType,
      };
    }),

  attachReceiptDocument: managerProcedure
    .input(
      z.object({
        movementId: z.number().int().positive(),
        documentKey: z
          .string()
          .min(1)
          .max(420)
          .regex(/^fuel-receipts\/[A-Za-z0-9._/-]+$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [movement] = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.id, input.movementId),
            eq(stockMovements.unitId, ctx.user.unitId),
            eq(stockMovements.movementType, "receipt")
          )
        )
        .limit(1);
      if (!movement)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entrada não encontrada.",
        });
      if (
        !input.documentKey.startsWith(
          `fuel-receipts/${ctx.user.unitId}/${movement.id}/`
        )
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "O comprovante não pertence a esta entrada.",
        });
      await db.transaction(async tx => {
        await tx
          .update(stockMovements)
          .set({ documentKey: input.documentKey })
          .where(eq(stockMovements.id, movement.id));
        await logAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "stock_movement",
          movement.id,
          "receipt_document_attached",
          "Comprovante vinculado à entrada."
        );
      });
      return {
        success: true,
        documentUrl: `/api/files/${input.documentKey}`,
      };
    }),

  recordMeasurement: managerProcedure
    .input(
      z.object({
        tankId: z.number().int().positive(),
        physicalLiters: litersInput,
        measuredAt: z.string().datetime(),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      return db.transaction(async tx => {
        const tank = await lockTank(tx, ctx.user.unitId, input.tankId, true);
        if (!tank)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tanque ativo não encontrado.",
          });
        if (input.physicalLiters > safeNumber(tank.capacityTotalLiters))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O volume físico não pode exceder a capacidade total do tanque.",
          });
        const theoreticalLiters = await movementBalance(
          tx,
          ctx.user.unitId,
          tank.id
        );
        const differenceLiters = roundLiters(
          input.physicalLiters - theoreticalLiters
        );
        const differencePercent =
          theoreticalLiters === 0
            ? null
            : Math.round((differenceLiters / theoreticalLiters) * 100_000) /
              1000;
        const [inserted] = await tx
          .insert(tankMeasurements)
          .values({
            unitId: ctx.user.unitId,
            tankId: tank.id,
            physicalLiters: input.physicalLiters.toFixed(3),
            theoreticalLiters: theoreticalLiters.toFixed(3),
            differenceLiters: differenceLiters.toFixed(3),
            differencePercent:
              differencePercent === null ? null : differencePercent.toFixed(3),
            measuredAt: new Date(input.measuredAt),
            notes: input.notes || null,
            measuredBy: ctx.user.id,
          })
          .returning({ id: tankMeasurements.id });
        const id = inserted.id;
        await logAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "tank_measurement",
          id,
          "recorded",
          `Medição física ${input.physicalLiters.toFixed(3)} L; teórico preservado em ${theoreticalLiters.toFixed(3)} L.`
        );
        return { id, theoreticalLiters, differenceLiters, differencePercent };
      });
    }),

  recordWriteoff: managerProcedure
    .input(
      z.object({
        tankId: z.number().int().positive(),
        quantityLiters: positiveLitersInput,
        occurredAt: z.string().datetime(),
        idempotencyKey: z.string().uuid(),
        reason: z.string().trim().min(5).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const sourceKey = `writeoff:${ctx.user.unitId}:${input.idempotencyKey}`;
      const [duplicate] = await db
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(eq(stockMovements.sourceKey, sourceKey))
        .limit(1);
      if (duplicate) return { id: duplicate.id, duplicate: true };
      try {
        const result = await db.transaction(async tx => {
          const tank = await lockTank(tx, ctx.user.unitId, input.tankId, true);
          if (!tank)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Tanque ativo não encontrado.",
            });
          const [sameKey] = await tx
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.sourceKey, sourceKey))
            .limit(1);
          if (sameKey) return { id: sameKey.id, duplicate: true };
          const current = await movementBalance(tx, ctx.user.unitId, tank.id);
          if (input.quantityLiters > current)
            throw new TRPCError({
              code: "CONFLICT",
              message: "A baixa não pode superar o estoque teórico atual.",
            });
          const [inserted] = await tx
            .insert(stockMovements)
            .values({
              unitId: ctx.user.unitId,
              tankId: tank.id,
              movementType: "writeoff",
              quantityLiters: (-input.quantityLiters).toFixed(3),
              sourceKey,
              notes: input.reason,
              occurredAt: new Date(input.occurredAt),
              createdBy: ctx.user.id,
            })
            .returning({ id: stockMovements.id });
          const id = inserted.id;
          await logAudit(
            tx,
            ctx.user.unitId,
            ctx.user.id,
            "stock_movement",
            id,
            "authorized_writeoff",
            input.reason
          );
          return { id, duplicate: false };
        });
        return result;
      } catch (error) {
        const [sameKey] = await db
          .select({ id: stockMovements.id })
          .from(stockMovements)
          .where(eq(stockMovements.sourceKey, sourceKey))
          .limit(1);
        if (sameKey) return { id: sameKey.id, duplicate: true };
        throw error;
      }
    }),

  movements: managerProcedure
    .input(
      z
        .object({
          tankId: z.number().int().positive().optional(),
          fuelType: fuelNameInput.optional(),
          from: dateInput.optional(),
          to: dateInput.optional(),
          movementType: z
            .enum(["opening", "receipt", "sale", "writeoff", "correction"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const all = await db
        .select({
          movement: stockMovements,
          tankName: fuelTanks.name,
          tankCode: fuelTanks.code,
          fuelType: fuelTanks.fuelType,
          responsible: appUsers.fullName,
        })
        .from(stockMovements)
        .innerJoin(fuelTanks, eq(stockMovements.tankId, fuelTanks.id))
        .innerJoin(appUsers, eq(stockMovements.createdBy, appUsers.id))
        .where(eq(stockMovements.unitId, ctx.user.unitId))
        .orderBy(asc(stockMovements.occurredAt), asc(stockMovements.id));
      const balances = new Map<number, number>();
      const withBalance = all.map(row => {
        const before = balances.get(row.movement.tankId) ?? 0;
        const after = roundLiters(
          before + safeNumber(row.movement.quantityLiters)
        );
        balances.set(row.movement.tankId, after);
        return {
          ...row.movement,
          tankName: row.tankName,
          tankCode: row.tankCode,
          fuelType: row.fuelType,
          responsible: row.responsible,
          balanceAfterLiters: after,
        };
      });
      return withBalance
        .filter(
          row =>
            (!input?.tankId || row.tankId === input.tankId) &&
            (!input?.fuelType || row.fuelType === input.fuelType) &&
            (!input?.movementType || row.movementType === input.movementType) &&
            (!input?.from ||
              row.occurredAt >= new Date(`${input.from}T00:00:00`)) &&
            (!input?.to ||
              row.occurredAt <= new Date(`${input.to}T23:59:59.999`))
        )
        .reverse();
    }),

  measurements: managerProcedure
    .input(
      z.object({ tankId: z.number().int().positive().optional() }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const where = input?.tankId
        ? and(
            eq(tankMeasurements.unitId, ctx.user.unitId),
            eq(tankMeasurements.tankId, input.tankId)
          )
        : eq(tankMeasurements.unitId, ctx.user.unitId);
      return db
        .select({
          measurement: tankMeasurements,
          tankName: fuelTanks.name,
          tankCode: fuelTanks.code,
          measuredByName: appUsers.fullName,
        })
        .from(tankMeasurements)
        .innerJoin(fuelTanks, eq(tankMeasurements.tankId, fuelTanks.id))
        .innerJoin(appUsers, eq(tankMeasurements.measuredBy, appUsers.id))
        .where(where)
        .orderBy(desc(tankMeasurements.measuredAt))
        .limit(500);
    }),
});
