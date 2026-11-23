import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../drizzle/schema.pg";
import { createIntegrationHarness, integrationEnabled } from "./harness";

const payments = [
  { method: "dinheiro" as const, amountCents: 0 },
  { method: "pix" as const, amountCents: 0 },
  { method: "debito" as const, amountCents: 0 },
  { method: "credito" as const, amountCents: 0 },
];

async function createDraft(
  harness: Awaited<ReturnType<typeof createIntegrationHarness>>,
  admin: Awaited<ReturnType<typeof harness.bootstrapAdmin>>,
  employeeId: number,
  closureDate: string,
  shift: "manha" | "tarde" | "noite" = "manha"
) {
  const caller = await harness.as(admin);
  const pumps = await caller.settings.pumps();
  const result = await caller.closures.saveDraft({
    closureDate,
    shift,
    employeeId,
    responsibleName: "Responsável de teste",
    notes: "",
    employeeConfirmed: false,
    responsibleConfirmed: false,
    nozzles: pumps.map(pump => ({
      pumpId: pump.id,
      initialReading: "0",
      finalReading: "0",
    })),
    payments,
    participants: [{ employeeId, sharePercent: 100 }],
  });
  return result.id;
}

describe.skipIf(!integrationEnabled)(
  "arquivamento lógico de fechamentos",
  () => {
    it("arquiva com auditoria e omite do histórico padrão, mantendo o rascunho restaurável", async () => {
      const harness = await createIntegrationHarness();
      const admin = await harness.bootstrapAdmin();
      const employeeId = await harness.createEmployee(
        admin,
        "Frentista Arquivo"
      );
      const closureId = await createDraft(
        harness,
        admin,
        employeeId,
        "2026-11-20"
      );
      const caller = await harness.as(admin);

      await caller.closures.archiveDraft({
        id: closureId,
        reason: "Rascunho duplicado confirmado.",
        confirmation: "EXCLUIR",
      });

      const [archived] = await harness.db
        .select()
        .from(schema.closures)
        .where(eq(schema.closures.id, closureId));
      const [audit] = await harness.db
        .select()
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.targetType, "closure"),
            eq(schema.auditEvents.targetId, closureId),
            eq(schema.auditEvents.action, "closure_archived")
          )
        );
      const activeHistory = await caller.closures.listPage({
        includeArchived: false,
        limit: 50,
      });
      const archivedHistory = await caller.closures.listPage({
        includeArchived: true,
        limit: 50,
      });

      expect(archived.deletedAt).toBeInstanceOf(Date);
      expect(audit).toMatchObject({
        userId: admin.user.id,
        targetId: closureId,
        field: "deletedAt",
        beforeValue: null,
        afterValue: archived.deletedAt?.toISOString(),
        reason: "Rascunho duplicado confirmado.",
      });
      expect(activeHistory.items.some(row => row.id === closureId)).toBe(false);
      expect(archivedHistory.items.some(row => row.id === closureId)).toBe(
        true
      );

      await caller.closures.restoreDraft({
        id: closureId,
        reason: "Duplicidade revisada e removida.",
      });
      const [restored] = await harness.db
        .select()
        .from(schema.closures)
        .where(eq(schema.closures.id, closureId));
      expect(restored.deletedAt).toBeNull();
      const restoreAudits = await harness.db
        .select()
        .from(schema.auditEvents)
        .where(
          and(
            eq(schema.auditEvents.targetType, "closure"),
            eq(schema.auditEvents.targetId, closureId),
            eq(schema.auditEvents.action, "closure_restored")
          )
        );
      expect(restoreAudits).toHaveLength(1);
      expect(restoreAudits[0].reason).toBe("Duplicidade revisada e removida.");
    });

    it("recusa gerente e bloqueia edição/finalização do arquivado no servidor", async () => {
      const harness = await createIntegrationHarness();
      const admin = await harness.bootstrapAdmin();
      const employeeId = await harness.createEmployee(
        admin,
        "Frentista Protegido"
      );
      const closureId = await createDraft(
        harness,
        admin,
        employeeId,
        "2026-11-21"
      );
      const manager = await harness.createUser(admin, {
        username: "gerente.arquivo",
        fullName: "Gerente sem permissão de arquivar",
        password: "Senha gerente integração 123!",
        role: "gerente",
      });
      const managerCaller = await harness.as(manager);

      await expect(
        managerCaller.closures.archiveDraft({
          id: closureId,
          reason: "Tentativa sem permissão.",
          confirmation: "EXCLUIR",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const adminCaller = await harness.as(admin);
      await adminCaller.closures.archiveDraft({
        id: closureId,
        reason: "Rascunho removido da lista ativa.",
        confirmation: "EXCLUIR",
      });
      await expect(
        adminCaller.closures.finalize({ id: closureId })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const pumps = await adminCaller.settings.pumps();
      await expect(
        adminCaller.closures.saveDraft({
          closureId,
          closureDate: "2026-11-21",
          shift: "manha",
          employeeId,
          responsibleName: "Responsável de teste",
          notes: "",
          employeeConfirmed: false,
          responsibleConfirmed: false,
          nozzles: pumps.map(pump => ({
            pumpId: pump.id,
            initialReading: "0",
            finalReading: "0",
          })),
          payments,
          participants: [{ employeeId, sharePercent: 100 }],
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("recusa restaurar quando outro fechamento ativo ocupa a mesma data e turno", async () => {
      const harness = await createIntegrationHarness();
      const admin = await harness.bootstrapAdmin();
      const employeeId = await harness.createEmployee(
        admin,
        "Frentista Conflito"
      );
      const archivedId = await createDraft(
        harness,
        admin,
        employeeId,
        "2026-11-22"
      );
      const caller = await harness.as(admin);
      await caller.closures.archiveDraft({
        id: archivedId,
        reason: "Rascunho a ser restaurado.",
        confirmation: "EXCLUIR",
      });
      const activeId = await createDraft(
        harness,
        admin,
        employeeId,
        "2026-11-22"
      );

      await expect(
        caller.closures.restoreDraft({
          id: archivedId,
          reason: "Tentativa de restauração conflitante.",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const [archived] = await harness.db
        .select()
        .from(schema.closures)
        .where(eq(schema.closures.id, archivedId));
      const [active] = await harness.db
        .select()
        .from(schema.closures)
        .where(eq(schema.closures.id, activeId));
      expect(archived.deletedAt).toBeInstanceOf(Date);
      expect(active.deletedAt).toBeNull();
    });
  }
);
