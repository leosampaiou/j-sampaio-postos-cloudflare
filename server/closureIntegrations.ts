import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  closureNozzles,
  closureParticipants,
  closures,
  discrepancyAllocations,
  discrepancyCases,
  employees,
  fuelTanks,
  stockMovements,
  tankPumpAssignments,
} from "../drizzle/schema.pg";
import { allocateCentsByShare } from "../shared/discrepancyAllocation";
import { roundLiters } from "../shared/inventory";

const amountOf = (value: unknown) => Number(value ?? 0);

export async function syncFinalizedClosure(
  tx: any,
  input: { closureId: number; unitId: number; userId: number }
) {
  const [closure] = await tx
    .select()
    .from(closures)
    .where(
      and(eq(closures.id, input.closureId), eq(closures.unitId, input.unitId))
    )
    .limit(1);
  if (!closure)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Fechamento não encontrado durante a integração.",
    });

  const nozzles = await tx
    .select()
    .from(closureNozzles)
    .where(eq(closureNozzles.closureId, closure.id));
  const allTanks = await tx
    .select()
    .from(fuelTanks)
    .where(eq(fuelTanks.unitId, input.unitId));
  const activeTanks = allTanks.filter(
    (tank: (typeof allTanks)[number]) => tank.active
  );

  // Until a manager configures any tank, preserve the current closing workflow without manufacturing stock.
  if (allTanks.length) {
    const assignments = await tx
      .select()
      .from(tankPumpAssignments)
      .where(eq(tankPumpAssignments.unitId, input.unitId));
    const assignmentByPump = new Map<number, (typeof assignments)[number]>(
      assignments.map((item: (typeof assignments)[number]) => [
        item.pumpId,
        item,
      ])
    );
    const tankById = new Map<number, (typeof activeTanks)[number]>(
      activeTanks.map((tank: (typeof activeTanks)[number]) => [tank.id, tank])
    );
    const missing = nozzles.filter(
      (nozzle: (typeof nozzles)[number]) =>
        amountOf(nozzle.liters) > 0 &&
        (() => {
          const assignment = assignmentByPump.get(nozzle.pumpId);
          const tank = assignment ? tankById.get(assignment.tankId) : undefined;
          return !assignment || !tank || tank.fuelType !== nozzle.fuelType;
        })()
    );
    if (missing.length) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Configure um tanque compatível para: ${missing.map((nozzle: (typeof nozzles)[number]) => nozzle.pumpNumber).join(", ")}. Nenhuma baixa foi gravada.`,
      });
    }

    // Lock configured tanks in stable order so receipts, writeoffs, measurements and sales
    // serialize their stock movement writes and cannot observe conflicting capacity checks.
    const tankIdsSet = new Set<number>();
    for (const nozzle of nozzles as Array<typeof closureNozzles.$inferSelect>) {
      const assignment = assignmentByPump.get(nozzle.pumpId);
      const tank = assignment ? tankById.get(assignment.tankId) : undefined;
      if (amountOf(nozzle.liters) > 0 && tank) tankIdsSet.add(tank.id);
    }
    const tankIds = [...tankIdsSet].sort((a: number, b: number) => a - b);
    for (const tankId of tankIds) {
      const [lockedTank] = await tx
        .select({ id: fuelTanks.id })
        .from(fuelTanks)
        .where(
          and(eq(fuelTanks.id, tankId), eq(fuelTanks.unitId, input.unitId))
        )
        .limit(1)
        .for("update");
      if (!lockedTank)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Um tanque foi removido durante a finalização. Nenhuma baixa foi gravada.",
        });
    }

    const previous = await tx
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.unitId, input.unitId),
          eq(stockMovements.sourceClosureId, closure.id)
        )
      );
    const priorByPumpTank = new Map<string, number>();
    for (const movement of previous) {
      if (movement.sourcePumpId === null) continue;
      const key = `${movement.sourcePumpId}:${movement.tankId}`;
      priorByPumpTank.set(
        key,
        roundLiters(
          (priorByPumpTank.get(key) ?? 0) + amountOf(movement.quantityLiters)
        )
      );
    }
    const desiredByPumpTank = new Map<
      string,
      { pumpId: number; tankId: number; liters: number; pumpNumber: string }
    >();
    for (const nozzle of nozzles) {
      const assignment = assignmentByPump.get(nozzle.pumpId);
      const tank = assignment ? tankById.get(assignment.tankId) : undefined;
      if (!assignment || !tank || tank.fuelType !== nozzle.fuelType) continue;
      if (closure.closureDate < tank.stockStartDate) continue;
      desiredByPumpTank.set(`${nozzle.pumpId}:${tank.id}`, {
        pumpId: nozzle.pumpId,
        tankId: tank.id,
        liters: -amountOf(nozzle.liters),
        pumpNumber: nozzle.pumpNumber,
      });
    }
    const pairs = new Set([
      ...priorByPumpTank.keys(),
      ...desiredByPumpTank.keys(),
    ]);
    for (const pair of pairs) {
      const [pumpIdText, tankIdText] = pair.split(":");
      const pumpId = Number(pumpIdText);
      const tankId = Number(tankIdText);
      const current = priorByPumpTank.get(pair) ?? 0;
      const desired = desiredByPumpTank.get(pair)?.liters ?? 0;
      const delta = roundLiters(desired - current);
      if (Math.abs(delta) < 0.0005) continue;
      const pumpNumber =
        desiredByPumpTank.get(pair)?.pumpNumber ??
        nozzles.find((item: (typeof nozzles)[number]) => item.pumpId === pumpId)
          ?.pumpNumber ??
        `Bico ${pumpId}`;
      await tx.insert(stockMovements).values({
        unitId: input.unitId,
        tankId,
        movementType: delta < 0 ? "sale" : "correction",
        quantityLiters: delta.toFixed(3),
        sourceKey: `closure:${closure.id}:revision:${closure.revision}:pump:${pumpId}:tank:${tankId}`,
        sourceClosureId: closure.id,
        sourcePumpId: pumpId,
        notes:
          delta < 0
            ? `Venda do ${pumpNumber} no fechamento ${closure.closureDate}.`
            : `Correção compensatória do ${pumpNumber} no fechamento ${closure.closureDate}.`,
        occurredAt: closure.finalizedAt ?? new Date(),
        createdBy: input.userId,
      });
    }
  }

  const existingCases = await tx
    .select()
    .from(discrepancyCases)
    .where(eq(discrepancyCases.closureId, closure.id))
    .limit(1);
  const existingCase = existingCases[0];
  if (closure.result === "sobra" || closure.result === "falta") {
    const amountCents = Math.abs(closure.differenceCents);
    const participantRows = await tx
      .select({ participant: closureParticipants })
      .from(closureParticipants)
      .innerJoin(employees, eq(closureParticipants.employeeId, employees.id))
      .where(
        and(
          eq(closureParticipants.closureId, closure.id),
          eq(employees.unitId, input.unitId)
        )
      );
    const documentedParticipants: (typeof closureParticipants.$inferSelect)[] =
      participantRows.map(
        (row: { participant: typeof closureParticipants.$inferSelect }) =>
          row.participant
      );
    const allocatedShares: ReturnType<typeof allocateCentsByShare> =
      documentedParticipants.length
        ? (() => {
            try {
              return allocateCentsByShare(
                amountCents,
                documentedParticipants.map(person => ({
                  employeeId: person.employeeId,
                  sharePercent: person.sharePercent,
                }))
              );
            } catch {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "O rateio explícito do fechamento precisa totalizar 100% entre funcionários desta unidade antes da análise da divergência.",
              });
            }
          })()
        : [];

    let caseId: number;
    let caseRevision = closure.revision;
    if (!existingCase) {
      const [inserted] = await tx
        .insert(discrepancyCases)
        .values({
          unitId: input.unitId,
          closureId: closure.id,
          closureRevision: caseRevision,
          type: closure.result,
          amountCents,
          status: "pendente_analise",
          justification: closure.notes || null,
        })
        .returning({ id: discrepancyCases.id });
      caseId = inserted.id;
      await tx.insert(auditEvents).values({
        unitId: input.unitId,
        userId: input.userId,
        targetType: "discrepancy_case",
        targetId: caseId,
        action: "created",
        field: "closureRevision",
        beforeValue: null,
        afterValue: String(caseRevision),
        reason: documentedParticipants.length
          ? "Ocorrência vinculada ao fechamento; rateio explícito preservado."
          : "Ocorrência vinculada ao fechamento sem rateio individual documentado.",
      });
    } else {
      caseId = existingCase.id;
      const priorAllocations = await tx
        .select({
          employeeId: discrepancyAllocations.employeeId,
          allocatedCents: discrepancyAllocations.allocatedCents,
        })
        .from(discrepancyAllocations)
        .where(
          and(
            eq(discrepancyAllocations.caseId, caseId),
            eq(
              discrepancyAllocations.closureRevision,
              existingCase.closureRevision
            )
          )
        );
      const priorMap = new Map<number, number>(
        priorAllocations.map(
          (row: { employeeId: number; allocatedCents: number }) => [
            Number(row.employeeId),
            Number(row.allocatedCents),
          ]
        )
      );
      const nextMap = new Map<number, number>(
        allocatedShares.map(person => [
          person.employeeId,
          person.allocatedCents,
        ])
      );
      const allocationChanged =
        priorMap.size !== nextMap.size ||
        [...priorMap].some(
          ([employeeId, cents]) => nextMap.get(employeeId) !== cents
        );
      const changed =
        existingCase.type !== closure.result ||
        existingCase.amountCents !== amountCents ||
        existingCase.closureRevision !== closure.revision ||
        allocationChanged;
      caseRevision = changed ? closure.revision : existingCase.closureRevision;
      const reviewNotes = changed
        ? [
            existingCase.reviewNotes,
            `Fechamento corrigido na revisão ${closure.revision}; análise e decisões de folha anteriores permanecem somente no histórico da revisão ${existingCase.closureRevision}.`,
          ]
            .filter(Boolean)
            .join("\n")
        : existingCase.reviewNotes;
      await tx
        .update(discrepancyCases)
        .set({
          closureRevision: caseRevision,
          type: closure.result,
          amountCents,
          justification: closure.notes || existingCase.justification,
          status: changed ? "pendente_analise" : existingCase.status,
          decisionBy: changed ? null : existingCase.decisionBy,
          decisionAt: changed ? null : existingCase.decisionAt,
          reviewNotes,
        })
        .where(eq(discrepancyCases.id, caseId));
      if (changed) {
        await tx.insert(auditEvents).values({
          unitId: input.unitId,
          userId: input.userId,
          targetType: "discrepancy_case",
          targetId: caseId,
          action: "analysis_reopened_for_revision",
          field: "closureRevision",
          beforeValue: String(existingCase.closureRevision),
          afterValue: String(caseRevision),
          reason:
            "A correção invalidou a análise anterior; as decisões de folha anteriores foram preservadas e não se aplicam à revisão atual.",
        });
      }
    }

    for (const participant of allocatedShares) {
      await tx
        .insert(discrepancyAllocations)
        .values({
          caseId,
          employeeId: participant.employeeId,
          closureRevision: caseRevision,
          allocatedCents: participant.allocatedCents,
        })
        .onConflictDoUpdate({
          target: [
            discrepancyAllocations.caseId,
            discrepancyAllocations.closureRevision,
            discrepancyAllocations.employeeId,
          ],
          set: { allocatedCents: participant.allocatedCents },
        });
    }
  } else if (existingCase && existingCase.status !== "cancelada_por_correcao") {
    await tx
      .update(discrepancyCases)
      .set({
        closureRevision: closure.revision,
        status: "cancelada_por_correcao",
        decisionBy: input.userId,
        decisionAt: new Date(),
        reviewNotes: [
          existingCase.reviewNotes,
          `Ocorrência preservada; fechamento corrigido na revisão ${closure.revision} e diferença removida. Decisões anteriores permanecem somente no histórico da revisão ${existingCase.closureRevision}.`,
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .where(eq(discrepancyCases.id, existingCase.id));
    await tx.insert(auditEvents).values({
      unitId: input.unitId,
      userId: input.userId,
      targetType: "discrepancy_case",
      targetId: existingCase.id,
      action: "cancelled_by_closure_correction",
      field: "closureRevision",
      beforeValue: String(existingCase.closureRevision),
      afterValue: String(closure.revision),
      reason:
        "Fechamento corrigido; ocorrência e decisões anteriores preservadas para auditoria.",
    });
  }
}
