import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  appUsers,
  auditEvents,
  closureParticipants,
  closures,
  discrepancyAllocations,
  discrepancyCases,
  employees,
  payrollAdjustmentReviews,
} from "../../drizzle/schema.pg";
import { allocateCentsByShare } from "../../shared/discrepancyAllocation";
import {
  canTransitionPayrollReview,
  isApprovedAmountValid,
  payrollAdjustmentInitialStatuses,
  payrollAdjustmentStatuses,
} from "../../shared/payrollReview";
import {
  businessDateInSaoPaulo,
  isValidCalendarDate,
  shiftCalendarDate,
} from "../../shared/businessDate";
import {
  adminProcedure,
  managerProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";

const caseStatus = z.enum([
  "pendente_analise",
  "em_investigacao",
  "justificada",
  "encerrada_sem_desconto",
  "encaminhada_administrativo",
  "resolvida",
]);
const adjustmentStatus = z.enum(payrollAdjustmentStatuses);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Informe uma data de calendário válida.");

async function audit(
  tx: any,
  unitId: number,
  userId: number,
  targetType: string,
  targetId: number,
  action: string,
  reason: string
) {
  await tx
    .insert(auditEvents)
    .values({ unitId, userId, targetType, targetId, action, reason });
}

async function currentEmployeeIds(db: any, unitId: number, userId: number) {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(eq(employees.unitId, unitId), eq(employees.linkedUserId, userId))
    );
  return rows.map((row: { id: number }) => row.id);
}

export const discrepanciesRouter = router({
  backfillHistorical: managerProcedure.mutation(async ({ ctx }) => {
    const db = ctx.db;
    const rows = await db
      .select()
      .from(closures)
      .where(
        and(
          eq(closures.unitId, ctx.user.unitId),
          eq(closures.status, "finalizado"),
          isNull(closures.deletedAt)
        )
      );
    const existing = await db
      .select({ closureId: discrepancyCases.closureId })
      .from(discrepancyCases)
      .where(eq(discrepancyCases.unitId, ctx.user.unitId));
    const existingIds = new Set(existing.map(row => row.closureId));
    const candidates = rows.filter(
      row =>
        (row.result === "sobra" || row.result === "falta") &&
        !existingIds.has(row.id)
    );
    let created = 0;
    await db.transaction(async tx => {
      for (const closure of candidates) {
        const amountCents = Math.abs(closure.differenceCents);
        const [inserted] = await tx
          .insert(discrepancyCases)
          .values({
            unitId: ctx.user.unitId,
            closureId: closure.id,
            closureRevision: closure.revision,
            type: closure.result as "sobra" | "falta",
            amountCents,
            status: "pendente_analise",
            justification: closure.notes || null,
          })
          .returning({ id: discrepancyCases.id });
        const caseId = inserted.id;
        const participantRows = await tx
          .select({ participant: closureParticipants })
          .from(closureParticipants)
          .innerJoin(
            employees,
            eq(closureParticipants.employeeId, employees.id)
          )
          .where(
            and(
              eq(closureParticipants.closureId, closure.id),
              eq(employees.unitId, ctx.user.unitId)
            )
          );
        const selected = participantRows.map(row => row.participant);
        const allocations = selected.length
          ? allocateCentsByShare(
              amountCents,
              selected.map(person => ({
                employeeId: person.employeeId,
                sharePercent: person.sharePercent,
              }))
            )
          : [];
        for (const allocation of allocations) {
          await tx.insert(discrepancyAllocations).values({
            caseId,
            employeeId: allocation.employeeId,
            closureRevision: closure.revision,
            allocatedCents: allocation.allocatedCents,
          });
        }
        await audit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "discrepancy_case",
          caseId,
          "historical_case_created",
          selected.length
            ? `Ocorrência importada do fechamento ${closure.id}; rateio documentado preservado e nenhum desconto realizado.`
            : `Ocorrência importada do fechamento ${closure.id} sem rateio individual documentado; nenhum funcionário foi imputado e nenhum desconto foi realizado.`
        );
        created++;
      }
    });
    return { created };
  }),

  list: protectedProcedure
    .input(
      z
        .object({
          from: calendarDateSchema.optional(),
          to: calendarDateSchema.optional(),
          month: monthSchema.optional(),
          employeeId: z.number().int().positive().optional(),
          status: z
            .enum([
              "pendente_analise",
              "em_investigacao",
              "justificada",
              "encerrada_sem_desconto",
              "encaminhada_administrativo",
              "resolvida",
              "cancelada_por_correcao",
            ])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const conditions: any[] = [
        eq(discrepancyCases.unitId, ctx.user.unitId),
        eq(closures.unitId, ctx.user.unitId),
        isNull(closures.deletedAt),
        eq(employees.unitId, ctx.user.unitId),
      ];
      if (input?.status)
        conditions.push(eq(discrepancyCases.status, input.status));
      if (input?.from) conditions.push(gte(closures.closureDate, input.from));
      if (input?.to) conditions.push(lte(closures.closureDate, input.to));
      if (input?.month) {
        conditions.push(gte(closures.closureDate, `${input.month}-01`));
        const [year, month] = input.month.split("-").map(Number);
        const lastDate = new Date(Date.UTC(year, month, 0)).getUTCDate();
        conditions.push(
          lte(
            closures.closureDate,
            `${input.month}-${String(lastDate).padStart(2, "0")}`
          )
        );
      }
      const ownIds =
        ctx.user.role === "frentista"
          ? await currentEmployeeIds(db, ctx.user.unitId, ctx.user.id)
          : [];
      if (ctx.user.role === "frentista" && !ownIds.length) return [];
      const rows = await db
        .select({
          discrepancy: discrepancyCases,
          closure: closures,
          leadEmployeeName: employees.fullName,
        })
        .from(discrepancyCases)
        .innerJoin(closures, eq(discrepancyCases.closureId, closures.id))
        .innerJoin(employees, eq(closures.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(closures.closureDate), desc(discrepancyCases.id));
      const ids = rows.map(row => row.discrepancy.id);
      if (!ids.length) return [];
      const allocations = await db
        .select({
          allocation: discrepancyAllocations,
          employeeName: employees.fullName,
        })
        .from(discrepancyAllocations)
        .innerJoin(
          employees,
          eq(discrepancyAllocations.employeeId, employees.id)
        )
        .innerJoin(
          discrepancyCases,
          eq(discrepancyAllocations.caseId, discrepancyCases.id)
        )
        .where(
          and(
            inArray(discrepancyAllocations.caseId, ids),
            eq(discrepancyCases.unitId, ctx.user.unitId),
            eq(employees.unitId, ctx.user.unitId)
          )
        )
        .orderBy(asc(discrepancyAllocations.employeeId));
      return rows
        .map(row => {
          const currentAllocations = allocations.filter(
            allocation =>
              allocation.allocation.caseId === row.discrepancy.id &&
              allocation.allocation.closureRevision ===
                row.discrepancy.closureRevision
          );
          const visibleAllocations =
            ctx.user.role === "frentista"
              ? currentAllocations.filter(allocation =>
                  ownIds.includes(allocation.allocation.employeeId)
                )
              : currentAllocations;
          if (ctx.user.role === "frentista") {
            const ownAmountCents = visibleAllocations.reduce(
              (sum, item) => sum + item.allocation.allocatedCents,
              0
            );
            return {
              id: row.discrepancy.id,
              closureId: row.discrepancy.closureId,
              closureRevision: row.discrepancy.closureRevision,
              type: row.discrepancy.type,
              amountCents: ownAmountCents,
              status: row.discrepancy.status,
              createdAt: row.discrepancy.createdAt,
              updatedAt: row.discrepancy.updatedAt,
              closureDate: row.closure.closureDate,
              shift: row.closure.shift,
              closureStatus: row.closure.status,
              responsibleName: row.closure.responsibleName,
              allocations: visibleAllocations.map(item => ({
                ...item.allocation,
                employeeName: item.employeeName,
              })),
              visibleToUser: visibleAllocations.length > 0,
            };
          }
          return {
            ...row.discrepancy,
            closureDate: row.closure.closureDate,
            shift: row.closure.shift,
            closureStatus: row.closure.status,
            responsibleName: row.closure.responsibleName,
            leadEmployeeName: row.leadEmployeeName,
            differenceCents: row.closure.differenceCents,
            allocations: visibleAllocations.map(item => ({
              ...item.allocation,
              employeeName: item.employeeName,
            })),
            visibleToUser: true,
          };
        })
        .filter(
          row =>
            row.visibleToUser &&
            (!input?.employeeId ||
              row.allocations.some(
                item => item.employeeId === input.employeeId
              ))
        );
    }),

  employees: managerProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        active: employees.active,
      })
      .from(employees)
      .where(eq(employees.unitId, ctx.user.unitId))
      .orderBy(asc(employees.fullName));
  }),

  employeeSummary: protectedProcedure
    .input(z.object({ month: monthSchema.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const ownIds =
        ctx.user.role === "frentista"
          ? await currentEmployeeIds(db, ctx.user.unitId, ctx.user.id)
          : [];
      if (ctx.user.role === "frentista" && !ownIds.length) return [];
      const closuresRows = await db
        .select({ closure: closures, employeeName: employees.fullName })
        .from(closures)
        .innerJoin(employees, eq(closures.employeeId, employees.id))
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            eq(employees.unitId, ctx.user.unitId)
          )
        );
      const closureIds = closuresRows.map(row => row.closure.id);
      const participants = closureIds.length
        ? await db
            .select({
              participant: closureParticipants,
              employeeName: employees.fullName,
            })
            .from(closureParticipants)
            .innerJoin(
              employees,
              eq(closureParticipants.employeeId, employees.id)
            )
            .innerJoin(closures, eq(closureParticipants.closureId, closures.id))
            .where(
              and(
                inArray(closureParticipants.closureId, closureIds),
                eq(closures.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId)
              )
            )
        : [];
      const cases = await db
        .select()
        .from(discrepancyCases)
        .where(eq(discrepancyCases.unitId, ctx.user.unitId));
      const caseIds = cases.map(row => row.id);
      const allocations = caseIds.length
        ? await db
            .select({
              allocation: discrepancyAllocations,
              employeeName: employees.fullName,
            })
            .from(discrepancyAllocations)
            .innerJoin(
              employees,
              eq(discrepancyAllocations.employeeId, employees.id)
            )
            .innerJoin(
              discrepancyCases,
              eq(discrepancyAllocations.caseId, discrepancyCases.id)
            )
            .where(
              and(
                inArray(discrepancyAllocations.caseId, caseIds),
                eq(discrepancyCases.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId)
              )
            )
        : [];
      const result = new Map<
        number,
        {
          employeeId: number;
          employeeName: string;
          closures: number;
          checked: number;
          surplusCount: number;
          shortageCount: number;
          surplusCents: number;
          shortageCents: number;
          openCases: number;
          justifiedCases: number;
          approvedAdjustmentCents: number;
        }
      >();
      const reviews = cases.length
        ? await db
            .select({ review: payrollAdjustmentReviews })
            .from(payrollAdjustmentReviews)
            .innerJoin(
              discrepancyCases,
              eq(payrollAdjustmentReviews.caseId, discrepancyCases.id)
            )
            .where(
              and(
                eq(payrollAdjustmentReviews.unitId, ctx.user.unitId),
                eq(discrepancyCases.unitId, ctx.user.unitId),
                eq(
                  payrollAdjustmentReviews.closureRevision,
                  discrepancyCases.closureRevision
                )
              )
            )
        : [];
      const allPeople = new Map<number, string>();
      closuresRows.forEach(row =>
        allPeople.set(row.closure.employeeId, row.employeeName)
      );
      participants.forEach(row =>
        allPeople.set(row.participant.employeeId, row.employeeName)
      );
      for (const [employeeId, employeeName] of allPeople) {
        if (ctx.user.role === "frentista" && !ownIds.includes(employeeId))
          continue;
        result.set(employeeId, {
          employeeId,
          employeeName,
          closures: 0,
          checked: 0,
          surplusCount: 0,
          shortageCount: 0,
          surplusCents: 0,
          shortageCents: 0,
          openCases: 0,
          justifiedCases: 0,
          approvedAdjustmentCents: 0,
        });
      }
      for (const row of closuresRows) {
        const closure = row.closure;
        if (
          closure.status !== "finalizado" &&
          closure.status !== "aguardando_conferencia"
        )
          continue;
        if (input?.month && !closure.closureDate.startsWith(input.month))
          continue;
        const involved = participants.filter(
          item => item.participant.closureId === closure.id
        );
        const people = involved.length
          ? involved.map(item => item.participant.employeeId)
          : [closure.employeeId];
        for (const employeeId of people) {
          const item = result.get(employeeId);
          if (!item) continue;
          item.closures++;
          if (closure.result === "conferido") item.checked++;
        }
      }
      for (const discrepancy of cases) {
        const closure = closuresRows.find(
          row => row.closure.id === discrepancy.closureId
        )?.closure;
        if (
          !closure ||
          (input?.month && !closure.closureDate.startsWith(input.month))
        )
          continue;
        const current = allocations.filter(
          row =>
            row.allocation.caseId === discrepancy.id &&
            row.allocation.closureRevision === discrepancy.closureRevision
        );
        for (const row of current) {
          const item = result.get(row.allocation.employeeId);
          if (!item) continue;
          if (discrepancy.type === "sobra") {
            item.surplusCount++;
            item.surplusCents += row.allocation.allocatedCents;
          } else {
            item.shortageCount++;
            item.shortageCents += row.allocation.allocatedCents;
          }
          if (
            [
              "pendente_analise",
              "em_investigacao",
              "encaminhada_administrativo",
            ].includes(discrepancy.status)
          )
            item.openCases++;
          if (
            ["justificada", "encerrada_sem_desconto", "resolvida"].includes(
              discrepancy.status
            )
          )
            item.justifiedCases++;
        }
      }
      for (const { review } of reviews) {
        if (
          review.status !== "aprovado" &&
          review.status !== "encaminhado_folha" &&
          review.status !== "processado"
        )
          continue;
        if (input?.month && review.referenceMonth !== input.month) continue;
        const item = result.get(review.employeeId);
        if (item)
          item.approvedAdjustmentCents += review.approvedAmountCents ?? 0;
      }
      return [...result.values()]
        .map(item => ({
          ...item,
          netCents: item.surplusCents - item.shortageCents,
        }))
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "pt-BR"));
    }),

  monthlySummary: managerProcedure
    .input(
      z.object({ month: monthSchema, employeeId: z.number().int().positive() })
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const [employee] = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.unitId, ctx.user.unitId)
          )
        )
        .limit(1);
      if (!employee)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Funcionário não encontrado.",
        });
      const monthClosures = await db
        .select({ closure: closures })
        .from(closures)
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            gte(closures.closureDate, `${input.month}-01`),
            lte(closures.closureDate, `${input.month}-31`),
            isNull(closures.deletedAt),
            or(
              eq(closures.status, "finalizado"),
              eq(closures.status, "aguardando_conferencia")
            )
          )
        );
      const monthClosureIds = monthClosures.map(row => row.closure.id);
      const participants = monthClosureIds.length
        ? await db
            .select({ participant: closureParticipants })
            .from(closureParticipants)
            .innerJoin(closures, eq(closureParticipants.closureId, closures.id))
            .innerJoin(
              employees,
              eq(closureParticipants.employeeId, employees.id)
            )
            .where(
              and(
                inArray(closureParticipants.closureId, monthClosureIds),
                eq(closures.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId),
                eq(closureParticipants.employeeId, input.employeeId)
              )
            )
        : [];
      const relevantIds = new Set(
        monthClosures
          .filter(
            row =>
              participants.some(
                item => item.participant.closureId === row.closure.id
              ) || row.closure.employeeId === input.employeeId
          )
          .map(row => row.closure.id)
      );
      const cases = await db
        .select()
        .from(discrepancyCases)
        .where(
          and(
            eq(discrepancyCases.unitId, ctx.user.unitId),
            inArray(
              discrepancyCases.closureId,
              [...relevantIds].length ? [...relevantIds] : [0]
            )
          )
        );
      const allocationRows = cases.length
        ? await db
            .select({ allocation: discrepancyAllocations })
            .from(discrepancyAllocations)
            .innerJoin(
              discrepancyCases,
              eq(discrepancyAllocations.caseId, discrepancyCases.id)
            )
            .innerJoin(
              employees,
              eq(discrepancyAllocations.employeeId, employees.id)
            )
            .where(
              and(
                inArray(
                  discrepancyAllocations.caseId,
                  cases.map(row => row.id)
                ),
                eq(discrepancyCases.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId)
              )
            )
        : [];
      const allocations = allocationRows.map(row => row.allocation);
      const details = cases
        .map(row => {
          const closure = monthClosures.find(
            item => item.closure.id === row.closureId
          )?.closure;
          const allocation = allocations.find(
            item =>
              item.caseId === row.id &&
              item.employeeId === input.employeeId &&
              item.closureRevision === row.closureRevision
          );
          return {
            ...row,
            closureDate: closure?.closureDate ?? "",
            shift: closure?.shift ?? "",
            responsibleName: closure?.responsibleName ?? "",
            allocatedCents: allocation?.allocatedCents ?? 0,
          };
        })
        .filter(row => row.allocatedCents > 0)
        .sort((a, b) => a.closureDate.localeCompare(b.closureDate));
      const relevantClosures = monthClosures.filter(row =>
        relevantIds.has(row.closure.id)
      );
      const surplus = details.filter(row => row.type === "sobra");
      const shortage = details.filter(row => row.type === "falta");
      return {
        employee: { id: employee.id, fullName: employee.fullName },
        month: input.month,
        closures: relevantClosures.length,
        checked: relevantClosures.filter(
          row => row.closure.status === "finalizado"
        ).length,
        surplusCount: surplus.length,
        shortageCount: shortage.length,
        surplusCents: surplus.reduce((sum, row) => sum + row.allocatedCents, 0),
        shortageCents: shortage.reduce(
          (sum, row) => sum + row.allocatedCents,
          0
        ),
        netCents:
          surplus.reduce((sum, row) => sum + row.allocatedCents, 0) -
          shortage.reduce((sum, row) => sum + row.allocatedCents, 0),
        occurrences: details,
      };
    }),

  monthlyTrend: protectedProcedure
    .input(
      z
        .object({ employeeId: z.number().int().positive().optional() })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const ownIds =
        ctx.user.role === "frentista"
          ? await currentEmployeeIds(db, ctx.user.unitId, ctx.user.id)
          : [];
      const targetIds =
        ctx.user.role === "frentista"
          ? ownIds
          : input?.employeeId
            ? [input.employeeId]
            : [];
      if (!targetIds.length) return [];
      if (ctx.user.role !== "frentista") {
        const valid = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.unitId, ctx.user.unitId),
              inArray(employees.id, targetIds)
            )
          );
        if (valid.length !== targetIds.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Funcionário não encontrado nesta unidade.",
          });
      }
      const today = businessDateInSaoPaulo();
      const from = shiftCalendarDate(`${today.slice(0, 7)}-01`, -365);
      const closureRows = await db
        .select({ closure: closures })
        .from(closures)
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            gte(closures.closureDate, from),
            lte(closures.closureDate, today),
            isNull(closures.deletedAt),
            or(
              eq(closures.status, "finalizado"),
              eq(closures.status, "aguardando_conferencia")
            )
          )
        );
      const closureIds = closureRows.map(row => row.closure.id);
      const participantRows = closureIds.length
        ? await db
            .select({ participant: closureParticipants })
            .from(closureParticipants)
            .innerJoin(closures, eq(closureParticipants.closureId, closures.id))
            .innerJoin(
              employees,
              eq(closureParticipants.employeeId, employees.id)
            )
            .where(
              and(
                inArray(closureParticipants.closureId, closureIds),
                eq(closures.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId)
              )
            )
        : [];
      const selectedClosures = closureRows.filter(row => {
        const assigned = participantRows
          .filter(person => person.participant.closureId === row.closure.id)
          .map(person => person.participant.employeeId);
        const people = assigned.length ? assigned : [row.closure.employeeId];
        return people.some(personId => targetIds.includes(personId));
      });
      const selectedIds = selectedClosures.map(row => row.closure.id);
      const cases = selectedIds.length
        ? await db
            .select()
            .from(discrepancyCases)
            .where(
              and(
                eq(discrepancyCases.unitId, ctx.user.unitId),
                inArray(discrepancyCases.closureId, selectedIds)
              )
            )
        : [];
      const allocationRows = cases.length
        ? await db
            .select({ allocation: discrepancyAllocations })
            .from(discrepancyAllocations)
            .innerJoin(
              discrepancyCases,
              eq(discrepancyAllocations.caseId, discrepancyCases.id)
            )
            .innerJoin(
              employees,
              eq(discrepancyAllocations.employeeId, employees.id)
            )
            .where(
              and(
                inArray(
                  discrepancyAllocations.caseId,
                  cases.map(row => row.id)
                ),
                eq(discrepancyCases.unitId, ctx.user.unitId),
                eq(employees.unitId, ctx.user.unitId)
              )
            )
        : [];
      const allocations = allocationRows.map(row => row.allocation);
      const months = Array.from({ length: 12 }, (_, index) => {
        const monthStart = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
        monthStart.setUTCMonth(monthStart.getUTCMonth() - (11 - index));
        return monthStart.toISOString().slice(0, 7);
      });
      const trend = new Map(
        months.map(month => [
          month,
          {
            month,
            closures: 0,
            checked: 0,
            surplusCount: 0,
            shortageCount: 0,
            surplusCents: 0,
            shortageCents: 0,
          },
        ])
      );
      for (const row of selectedClosures) {
        const item = trend.get(row.closure.closureDate.slice(0, 7));
        if (item) {
          item.closures++;
          if (row.closure.status === "finalizado") item.checked++;
        }
      }
      for (const discrepancy of cases) {
        if (discrepancy.status === "cancelada_por_correcao") continue;
        const closure = selectedClosures.find(
          row => row.closure.id === discrepancy.closureId
        )?.closure;
        if (!closure) continue;
        const item = trend.get(closure.closureDate.slice(0, 7));
        if (!item) continue;
        for (const allocation of allocations.filter(
          row =>
            row.caseId === discrepancy.id &&
            row.closureRevision === discrepancy.closureRevision &&
            targetIds.includes(row.employeeId)
        )) {
          if (discrepancy.type === "sobra") {
            item.surplusCount++;
            item.surplusCents += allocation.allocatedCents;
          } else {
            item.shortageCount++;
            item.shortageCents += allocation.allocatedCents;
          }
        }
      }
      return [...trend.values()];
    }),

  updateAnalysis: managerProcedure
    .input(
      z.object({
        caseId: z.number().int().positive(),
        status: z.enum([
          "pendente_analise",
          "em_investigacao",
          "justificada",
          "encerrada_sem_desconto",
          "encaminhada_administrativo",
          "resolvida",
        ]),
        justification: z.string().trim().max(4000).optional(),
        reviewNotes: z.string().trim().max(4000).optional(),
        evidenceKey: z.string().trim().max(420).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (
        [
          "justificada",
          "encerrada_sem_desconto",
          "encaminhada_administrativo",
          "resolvida",
        ].includes(input.status) &&
        !input.reviewNotes?.trim() &&
        !input.justification?.trim()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Registre comentário ou justificativa antes de concluir a análise.",
        });
      if (
        input.evidenceKey &&
        !input.evidenceKey.startsWith(
          `fuel-discrepancy-evidence/${ctx.user.unitId}/${input.caseId}/`
        )
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A evidência não pertence a esta ocorrência.",
        });
      const db = ctx.db;
      const [existing] = await db
        .select()
        .from(discrepancyCases)
        .where(
          and(
            eq(discrepancyCases.id, input.caseId),
            eq(discrepancyCases.unitId, ctx.user.unitId)
          )
        )
        .limit(1);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ocorrência não encontrada.",
        });
      if (existing.status === "cancelada_por_correcao")
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Esta ocorrência foi preservada, mas o fechamento corrigido removeu a divergência.",
        });
      await db.transaction(async tx => {
        const [current] = await tx
          .select()
          .from(discrepancyCases)
          .where(
            and(
              eq(discrepancyCases.id, input.caseId),
              eq(discrepancyCases.unitId, ctx.user.unitId)
            )
          )
          .limit(1)
          .for("update");
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Ocorrência não encontrada.",
          });
        if (
          current.closureRevision !== existing.closureRevision ||
          current.status === "cancelada_por_correcao"
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A ocorrência pertence a uma revisão anterior ou foi cancelada por correção; atualize a página antes de analisar.",
          });
        await tx
          .update(discrepancyCases)
          .set({
            status: input.status,
            justification: input.justification ?? current.justification,
            reviewNotes: input.reviewNotes ?? current.reviewNotes,
            evidenceKey: input.evidenceKey ?? current.evidenceKey,
            decisionBy: ctx.user.id,
            decisionAt: new Date(),
          })
          .where(eq(discrepancyCases.id, input.caseId));
        await audit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "discrepancy_case",
          input.caseId,
          "analysis_updated",
          `Status ${current.status} → ${input.status}; ${input.reviewNotes || input.justification || "sem comentário"}`
        );
      });
      return { success: true };
    }),

  evidenceUploadTarget: managerProcedure
    .input(
      z.object({
        caseId: z.number().int().positive(),
        fileName: z.string().trim().min(1).max(180),
        contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        sizeBytes: z.number().int().positive().max(10_485_760),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [caseRow] = await db
        .select({ id: discrepancyCases.id })
        .from(discrepancyCases)
        .where(
          and(
            eq(discrepancyCases.id, input.caseId),
            eq(discrepancyCases.unitId, ctx.user.unitId)
          )
        )
        .limit(1);
      if (!caseRow)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ocorrência não encontrada.",
        });
      if (!ctx.env.R2)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "O armazenamento seguro de evidências não está disponível.",
        });
      const extension =
        input.contentType === "application/pdf"
          ? "pdf"
          : input.contentType === "image/png"
            ? "png"
            : "jpg";
      const key = `fuel-discrepancy-evidence/${ctx.user.unitId}/${input.caseId}/${crypto.randomUUID()}.${extension}`;
      return {
        key,
        uploadUrl: `/api/files/${key}`,
        contentType: input.contentType,
      };
    }),

  adjustments: managerProcedure
    .input(
      z
        .object({
          month: monthSchema.optional(),
          employeeId: z.number().int().positive().optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const rows = await db
        .select({
          review: payrollAdjustmentReviews,
          employeeName: employees.fullName,
          caseType: discrepancyCases.type,
          closureId: discrepancyCases.closureId,
          caseRevision: discrepancyCases.closureRevision,
          caseStatus: discrepancyCases.status,
        })
        .from(payrollAdjustmentReviews)
        .innerJoin(
          employees,
          eq(payrollAdjustmentReviews.employeeId, employees.id)
        )
        .innerJoin(
          discrepancyCases,
          eq(payrollAdjustmentReviews.caseId, discrepancyCases.id)
        )
        .where(
          and(
            eq(payrollAdjustmentReviews.unitId, ctx.user.unitId),
            eq(employees.unitId, ctx.user.unitId),
            eq(discrepancyCases.unitId, ctx.user.unitId)
          )
        )
        .orderBy(desc(payrollAdjustmentReviews.createdAt));
      return rows
        .filter(
          row =>
            (!input?.month || row.review.referenceMonth === input.month) &&
            (!input?.employeeId || row.review.employeeId === input.employeeId)
        )
        .map(row => ({
          ...row,
          isCurrentRevision:
            row.review.closureRevision === row.caseRevision &&
            row.caseStatus !== "cancelada_por_correcao",
        }));
    }),

  createAdjustmentReview: managerProcedure
    .input(
      z.object({
        caseId: z.number().int().positive(),
        employeeId: z.number().int().positive(),
        referenceMonth: monthSchema,
        approvedAmountCents: z
          .number()
          .int()
          .positive()
          .max(2_000_000_000)
          .optional(),
        justification: z.string().trim().min(10).max(4000),
        status: z
          .enum(payrollAdjustmentInitialStatuses)
          .default("aguardando_analise"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const id = await db.transaction(async tx => {
        const [caseRow] = await tx
          .select()
          .from(discrepancyCases)
          .where(
            and(
              eq(discrepancyCases.id, input.caseId),
              eq(discrepancyCases.unitId, ctx.user.unitId)
            )
          )
          .limit(1)
          .for("update");
        if (!caseRow)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Ocorrência não encontrada.",
          });
        if (caseRow.status === "cancelada_por_correcao")
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Não é possível abrir análise de folha para uma ocorrência cancelada por correção.",
          });
        const [row] = await tx
          .select({ allocation: discrepancyAllocations })
          .from(discrepancyAllocations)
          .innerJoin(
            employees,
            eq(discrepancyAllocations.employeeId, employees.id)
          )
          .where(
            and(
              eq(discrepancyAllocations.caseId, input.caseId),
              eq(discrepancyAllocations.employeeId, input.employeeId),
              eq(
                discrepancyAllocations.closureRevision,
                caseRow.closureRevision
              ),
              eq(employees.unitId, ctx.user.unitId)
            )
          )
          .limit(1);
        if (!row)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O funcionário precisa ter uma alocação explícita nesta revisão da ocorrência.",
          });
        if (
          input.approvedAmountCents &&
          input.approvedAmountCents > row.allocation.allocatedCents
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O valor em análise não pode superar a parte atribuída nesta ocorrência.",
          });
        const [existingReview] = await tx
          .select({ id: payrollAdjustmentReviews.id })
          .from(payrollAdjustmentReviews)
          .where(
            and(
              eq(payrollAdjustmentReviews.unitId, ctx.user.unitId),
              eq(payrollAdjustmentReviews.caseId, input.caseId),
              eq(payrollAdjustmentReviews.employeeId, input.employeeId),
              eq(
                payrollAdjustmentReviews.closureRevision,
                caseRow.closureRevision
              )
            )
          )
          .limit(1);
        if (existingReview)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Já existe uma análise de folha para esta revisão da ocorrência e funcionário.",
          });
        const [result] = await tx
          .insert(payrollAdjustmentReviews)
          .values({
            unitId: ctx.user.unitId,
            caseId: input.caseId,
            employeeId: input.employeeId,
            closureRevision: caseRow.closureRevision,
            referenceMonth: input.referenceMonth,
            originalAmountCents: row.allocation.allocatedCents,
            approvedAmountCents: input.approvedAmountCents ?? null,
            justification: input.justification,
            status: input.status,
            createdBy: ctx.user.id,
          })
          .returning({ id: payrollAdjustmentReviews.id });
        const reviewId = result.id;
        await audit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "payroll_review",
          reviewId,
          "created",
          `Revisão ${caseRow.closureRevision}; registro de análise; nenhum desconto ou lançamento em folha foi realizado.`
        );
        return reviewId;
      });
      return { id };
    }),

  setAdjustmentStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: adjustmentStatus,
        approvedAmountCents: z
          .number()
          .int()
          .positive()
          .max(2_000_000_000)
          .optional(),
        justification: z.string().trim().min(10).max(4000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [existing] = await db
        .select()
        .from(payrollAdjustmentReviews)
        .where(
          and(
            eq(payrollAdjustmentReviews.id, input.id),
            eq(payrollAdjustmentReviews.unitId, ctx.user.unitId)
          )
        )
        .limit(1);
      if (!existing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Análise não encontrada.",
        });
      await db.transaction(async tx => {
        const [caseRow] = await tx
          .select()
          .from(discrepancyCases)
          .where(
            and(
              eq(discrepancyCases.id, existing.caseId),
              eq(discrepancyCases.unitId, ctx.user.unitId)
            )
          )
          .limit(1)
          .for("update");
        const [review] = await tx
          .select()
          .from(payrollAdjustmentReviews)
          .where(
            and(
              eq(payrollAdjustmentReviews.id, input.id),
              eq(payrollAdjustmentReviews.unitId, ctx.user.unitId)
            )
          )
          .limit(1)
          .for("update");
        if (!caseRow || !review)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Análise não encontrada.",
          });
        if (
          review.closureRevision !== caseRow.closureRevision ||
          caseRow.status === "cancelada_por_correcao"
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Esta análise pertence a uma revisão anterior do fechamento e não pode receber decisão. Abra uma nova análise para a revisão atual.",
          });
        if (!canTransitionPayrollReview(review.status, input.status))
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Transição não permitida: a aprovação exige análise e autorização prévias; o encaminhamento exige aprovação; e o processamento só pode ocorrer após o encaminhamento.",
          });
        if (
          !isApprovedAmountValid(
            input.status,
            input.approvedAmountCents,
            review.originalAmountCents
          )
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A aprovação exige um valor positivo, e o valor informado não pode superar o valor individual analisado.",
          });
        await tx
          .update(payrollAdjustmentReviews)
          .set({
            status: input.status,
            approvedAmountCents:
              input.status === "aprovado"
                ? input.approvedAmountCents!
                : (input.approvedAmountCents ?? review.approvedAmountCents),
            justification: input.justification,
            approvalBy:
              input.status === "aprovado" ? ctx.user.id : review.approvalBy,
            approvedAt:
              input.status === "aprovado"
                ? (review.approvedAt ?? new Date())
                : review.approvedAt,
          })
          .where(eq(payrollAdjustmentReviews.id, input.id));
        await audit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "payroll_review",
          input.id,
          "admin_decision",
          `Revisão ${review.closureRevision}; status ${review.status} → ${input.status}; registro não executa desconto automático.`
        );
      });
      return { success: true };
    }),
});
