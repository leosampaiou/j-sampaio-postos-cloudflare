import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  businessDateInSaoPaulo,
  isValidCalendarDate,
} from "../shared/businessDate";
import {
  appSessions,
  appUsers,
  auditEvents,
  closureNozzles,
  closureParticipants,
  closurePayments,
  closures,
  discrepancyCases,
  employees,
  fuelPrices,
  fuelPumps,
  unitSettings,
  units,
  stockMovements,
} from "../drizzle/schema.pg";
import { syncFinalizedClosure } from "./closureIntegrations";
import { isClosureArchivable } from "../shared/closureArchive";
import { discrepanciesRouter } from "./routers/discrepancies";
import { inventoryRouter } from "./routers/inventory";
import {
  clearSuccessfulLoginPair,
  consumeLoginAttempt,
} from "./loginRateLimit";
import type { PostgresDatabase } from "./db.pg";
import {
  constantTimeEqual,
  hashPassword,
  hashToken,
  issueSession,
  verifyPassword,
  APP_SESSION_COOKIE,
} from "./_core/appAuth";
import {
  appendExpiredSessionCookie,
  appendSessionCookie,
} from "./_core/cookies";
import { revokeCurrentSession } from "./_core/logout";
import {
  adminProcedure,
  managerProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

const roleSchema = z.enum(["frentista", "gerente", "administrador"]);
const shiftSchema = z.enum(["manha", "tarde", "noite"]);
const fuelSchema = z.enum(["gasolina_comum", "diesel_s10"]);
const paymentSchema = z.enum(["dinheiro", "pix", "debito", "credito"]);
const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Use letras, números, ponto, hífen ou sublinhado."
  );
const passwordSchema = z.string().min(12).max(128);
const calendarDateSchema = z
  .string()
  .refine(isValidCalendarDate, "Informe uma data de calendário válida.");
const parseReading = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(normalized))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Leitura inválida; use até três casas decimais.",
    });
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
};
const MAX_INTEGER = 2_147_483_647;
const positiveIntegerSchema = z.number().int().positive().max(MAX_INTEGER);
const integerSchema = z.number().int().max(MAX_INTEGER);
const checkedInteger = (value: number, message: string) => {
  if (
    !Number.isSafeInteger(value) ||
    value < -MAX_INTEGER ||
    value > MAX_INTEGER
  )
    throw new TRPCError({ code: "BAD_REQUEST", message });
  return value;
};
const validatePeriod = (from?: string, to?: string) => {
  if (from && to && from > to)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A data inicial não pode ser posterior à final",
    });
};
const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "23505";
const classify = (differenceCents: number, toleranceCents: number) =>
  Math.abs(differenceCents) <= toleranceCents
    ? ("conferido" as const)
    : differenceCents > 0
      ? ("sobra" as const)
      : ("falta" as const);
const publicUser = (u: typeof appUsers.$inferSelect) => ({
  id: u.id,
  unitId: u.unitId,
  username: u.username,
  fullName: u.fullName,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

async function addAudit(
  db: Pick<PostgresDatabase, "insert">,
  unitId: number,
  userId: number,
  targetType: string,
  targetId: number,
  action: string,
  reason?: string,
  field?: string,
  beforeValue?: string,
  afterValue?: string
) {
  await db.insert(auditEvents).values({
    unitId,
    userId,
    targetType,
    targetId,
    action,
    reason: reason ?? null,
    field: field ?? null,
    beforeValue: beforeValue ?? null,
    afterValue: afterValue ?? null,
  });
}

const authRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const [existing] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .limit(1);
    return { setupRequired: !existing };
  }),
  bootstrap: publicProcedure
    .input(
      z.object({
        activationKey: z.string().min(1).max(500),
        username: usernameSchema,
        fullName: z.string().trim().min(2).max(160),
        password: passwordSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const configured = ctx.env.INITIAL_ADMIN_SETUP_KEY;
      if (!configured || !constantTimeEqual(input.activationKey, configured))
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Chave de ativação inválida.",
        });
      const db = ctx.db;
      try {
        const unitId = await db.transaction(async tx => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext('j-sampaio-initial-bootstrap'))`
          );
          const [existing] = await tx
            .select({ id: appUsers.id })
            .from(appUsers)
            .limit(1);
          if (existing)
            throw new TRPCError({
              code: "CONFLICT",
              message: "A configuração inicial já foi concluída.",
            });
          const [unitResult] = await tx
            .insert(units)
            .values({
              legalName: "D ANDRADE SAMPAIO LTDA.",
              tradeName: "J SAMPAIO POSTOS",
              cnpj: "46.691.152/0001-89",
              address: "Rua Hildenora Gusmão, 231 – Centro",
              city: "Vargem Grande",
              state: "MA",
              postalCode: "65430-000",
            })
            .returning({ id: units.id });
          const id = unitResult.id;
          const [userResult] = await tx
            .insert(appUsers)
            .values({
              unitId: id,
              username: input.username.toLowerCase(),
              fullName: input.fullName,
              passwordHash: await hashPassword(input.password),
              role: "administrador",
            })
            .returning({ id: appUsers.id });
          const adminId = userResult.id;
          await tx.insert(fuelPumps).values([
            { unitId: id, number: "Bico 01", fuelType: "gasolina_comum" },
            { unitId: id, number: "Bico 02", fuelType: "gasolina_comum" },
            { unitId: id, number: "Bico 03", fuelType: "gasolina_comum" },
            { unitId: id, number: "Bico 04", fuelType: "diesel_s10" },
          ]);
          await tx.insert(fuelPrices).values([
            {
              unitId: id,
              fuelType: "gasolina_comum",
              priceCents: 0,
              createdBy: adminId,
            },
            {
              unitId: id,
              fuelType: "diesel_s10",
              priceCents: 0,
              createdBy: adminId,
            },
          ]);
          await tx.insert(unitSettings).values([
            {
              unitId: id,
              settingKey: "toleranceCents",
              settingValue: "0",
              updatedBy: adminId,
            },
            {
              unitId: id,
              settingKey: "bootstrapComplete",
              settingValue: "true",
              updatedBy: adminId,
            },
          ]);
          return id;
        });
        const [admin] = await db
          .select()
          .from(appUsers)
          .where(
            and(
              eq(appUsers.unitId, unitId),
              eq(appUsers.username, input.username.toLowerCase())
            )
          )
          .limit(1);
        if (!admin) throw new Error("Admin bootstrap did not persist");
        const session = await issueSession(ctx.db, admin.id);
        appendSessionCookie(ctx.resHeaders, APP_SESSION_COOKIE, session.token);
        return { user: publicUser(admin), csrfToken: session.csrfToken };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error(
          "[Bootstrap] failed:",
          error instanceof Error ? error.message : "unknown error"
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A configuração inicial não pôde ser concluída. Verifique se já existe uma conta ou unidade configurada.",
        });
      }
    }),
  login: publicProcedure
    .input(
      z.object({
        username: usernameSchema,
        password: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const now = Date.now();
      // Cloudflare overwrites cf-connecting-ip at its edge. Do not trust arbitrary
      // X-Forwarded-For values supplied by clients when the trusted header is absent.
      const ip = ctx.req.headers.get("cf-connecting-ip") ?? "unknown";
      const normalizedUsername = input.username.toLowerCase();
      const allowed = await consumeLoginAttempt(
        ctx.db,
        ip,
        normalizedUsername,
        new Date(now)
      );
      if (!allowed)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Usuário ou senha incorretos.",
        });
      const db = ctx.db;
      const [user] = await db
        .select()
        .from(appUsers)
        .where(eq(appUsers.username, normalizedUsername))
        .limit(1);
      let valid = false;
      if (user && user.active)
        valid = await verifyPassword(input.password, user.passwordHash);
      else await hashPassword(input.password.slice(0, 128).padEnd(12, "x"));
      if (!user || !user.active || !valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Usuário ou senha incorretos.",
        });
      }
      const session = await issueSession(ctx.db, user.id);
      await clearSuccessfulLoginPair(db, ip, normalizedUsername);
      appendSessionCookie(ctx.resHeaders, APP_SESSION_COOKIE, session.token);
      return { user: publicUser(user), csrfToken: session.csrfToken };
    }),
  me: protectedProcedure.query(({ ctx }) => ({
    user: publicUser(ctx.user),
    csrfToken: ctx.session.csrfToken,
  })),
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const db = ctx.db;
    return revokeCurrentSession(
      ctx.session.tokenHash,
      async tokenHash => {
        await db
          .update(appSessions)
          .set({ revokedAt: new Date() })
          .where(eq(appSessions.tokenHash, tokenHash));
      },
      () => appendExpiredSessionCookie(ctx.resHeaders, APP_SESSION_COOKIE)
    );
  }),
});

const employeesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const where =
      ctx.user.role === "frentista"
        ? and(
            eq(employees.unitId, ctx.user.unitId),
            eq(employees.linkedUserId, ctx.user.id)
          )
        : eq(employees.unitId, ctx.user.unitId);
    return db
      .select()
      .from(employees)
      .where(where)
      .orderBy(asc(employees.fullName));
  }),
  participantOptions: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return db
      .select({ id: employees.id, fullName: employees.fullName })
      .from(employees)
      .where(
        and(eq(employees.unitId, ctx.user.unitId), eq(employees.active, true))
      )
      .orderBy(asc(employees.fullName));
  }),
  create: managerProcedure
    .input(z.object({ fullName: z.string().trim().min(2).max(160) }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const id = await db.transaction(async tx => {
        const [result] = await tx
          .insert(employees)
          .values({ unitId: ctx.user.unitId, fullName: input.fullName })
          .returning({ id: employees.id });
        await addAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "employee",
          result.id,
          "created"
        );
        return result.id;
      });
      return { id };
    }),
  setActive: managerProcedure
    .input(z.object({ id: positiveIntegerSchema, active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      await db.transaction(async tx => {
        const [employee] = await tx
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.id, input.id),
              eq(employees.unitId, ctx.user.unitId)
            )
          )
          .limit(1);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(employees)
          .set({ active: input.active })
          .where(eq(employees.id, input.id));
        await addAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "employee",
          input.id,
          input.active ? "activated" : "deactivated"
        );
      });
      return { success: true };
    }),
});

const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const rows = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.unitId, ctx.user.unitId))
      .orderBy(asc(appUsers.fullName));
    return rows.map(publicUser);
  }),
  create: adminProcedure
    .input(
      z.object({
        username: usernameSchema,
        fullName: z.string().trim().min(2).max(160),
        password: passwordSchema,
        role: roleSchema,
        employeeId: positiveIntegerSchema.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      try {
        const id = await db.transaction(async tx => {
          if (input.employeeId) {
            const [employee] = await tx
              .select()
              .from(employees)
              .where(
                and(
                  eq(employees.id, input.employeeId),
                  eq(employees.unitId, ctx.user.unitId),
                  eq(employees.active, true)
                )
              )
              .limit(1)
              .for("update");
            if (!employee || employee.linkedUserId)
              throw new TRPCError({
                code: "CONFLICT",
                message: "Funcionário indisponível ou já vinculado.",
              });
          }
          const [result] = await tx
            .insert(appUsers)
            .values({
              unitId: ctx.user.unitId,
              username: input.username.toLowerCase(),
              fullName: input.fullName,
              passwordHash: await hashPassword(input.password),
              role: input.role,
            })
            .returning({ id: appUsers.id });
          if (input.employeeId) {
            const [linked] = await tx
              .update(employees)
              .set({ linkedUserId: result.id })
              .where(
                and(
                  eq(employees.id, input.employeeId),
                  eq(employees.unitId, ctx.user.unitId),
                  eq(employees.active, true),
                  isNull(employees.linkedUserId)
                )
              )
              .returning({ id: employees.id });
            if (!linked)
              throw new TRPCError({
                code: "CONFLICT",
                message: "Funcionário indisponível ou já vinculado.",
              });
          }
          await addAudit(
            tx,
            ctx.user.unitId,
            ctx.user.id,
            "user",
            result.id,
            "created",
            `Perfil: ${input.role}`
          );
          return result.id;
        });
        return { id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Não foi possível criar a conta; verifique o nome de usuário e o vínculo do funcionário.",
        });
      }
    }),
  setActive: adminProcedure
    .input(z.object({ id: positiveIntegerSchema, active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id && !input.active)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível desativar a própria conta.",
        });
      const db = ctx.db;
      await db.transaction(async tx => {
        const [target] = await tx
          .select()
          .from(appUsers)
          .where(
            and(eq(appUsers.id, input.id), eq(appUsers.unitId, ctx.user.unitId))
          )
          .limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(appUsers)
          .set({ active: input.active })
          .where(eq(appUsers.id, input.id));
        if (!input.active)
          await tx
            .update(appSessions)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(appSessions.userId, input.id),
                isNull(appSessions.revokedAt)
              )
            );
        await addAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "user",
          input.id,
          input.active ? "activated" : "deactivated"
        );
      });
      return { success: true };
    }),
});

const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const [unit] = await db
      .select()
      .from(units)
      .where(eq(units.id, ctx.user.unitId))
      .limit(1);
    const prices = await db
      .select()
      .from(fuelPrices)
      .where(eq(fuelPrices.unitId, ctx.user.unitId))
      .orderBy(desc(fuelPrices.effectiveAt));
    const settings = await db
      .select()
      .from(unitSettings)
      .where(eq(unitSettings.unitId, ctx.user.unitId));
    const latestPrice = (type: "gasolina_comum" | "diesel_s10") =>
      prices.find(p => p.fuelType === type)?.priceCents ?? 0;
    return {
      unit,
      prices: {
        gasolina_comum: latestPrice("gasolina_comum"),
        diesel_s10: latestPrice("diesel_s10"),
      },
      toleranceCents: Number(
        settings.find(s => s.settingKey === "toleranceCents")?.settingValue ?? 0
      ),
    };
  }),
  update: adminProcedure
    .input(
      z.object({
        gasolineCents: integerSchema.min(0).max(100000),
        dieselCents: integerSchema.min(0).max(100000),
        toleranceCents: integerSchema.min(0).max(100000),
        legalName: z.string().trim().min(2).max(180),
        tradeName: z.string().trim().min(2).max(120),
        cnpj: z.string().trim().min(14).max(20),
        address: z.string().trim().min(3).max(240),
        city: z.string().trim().min(2).max(100),
        state: z.string().trim().length(2),
        postalCode: z.string().trim().min(5).max(12),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [oldUnit] = await db
        .select()
        .from(units)
        .where(eq(units.id, ctx.user.unitId))
        .limit(1);
      if (!oldUnit) throw new TRPCError({ code: "NOT_FOUND" });
      await db.transaction(async tx => {
        await tx
          .update(units)
          .set({
            legalName: input.legalName,
            tradeName: input.tradeName,
            cnpj: input.cnpj,
            address: input.address,
            city: input.city,
            state: input.state.toUpperCase(),
            postalCode: input.postalCode,
          })
          .where(eq(units.id, ctx.user.unitId));
        await tx.insert(fuelPrices).values([
          {
            unitId: ctx.user.unitId,
            fuelType: "gasolina_comum",
            priceCents: input.gasolineCents,
            createdBy: ctx.user.id,
          },
          {
            unitId: ctx.user.unitId,
            fuelType: "diesel_s10",
            priceCents: input.dieselCents,
            createdBy: ctx.user.id,
          },
        ]);
        await tx
          .insert(unitSettings)
          .values({
            unitId: ctx.user.unitId,
            settingKey: "toleranceCents",
            settingValue: String(input.toleranceCents),
            updatedBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: [unitSettings.unitId, unitSettings.settingKey],
            set: {
              settingValue: String(input.toleranceCents),
              updatedBy: ctx.user.id,
              updatedAt: new Date(),
            },
          });
        await addAudit(
          tx,
          ctx.user.unitId,
          ctx.user.id,
          "settings",
          ctx.user.unitId,
          "updated",
          "Preços, tolerância e dados da unidade atualizados"
        );
      });
      return { success: true };
    }),
  pumps: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const pumps = await db
      .select()
      .from(fuelPumps)
      .where(
        and(eq(fuelPumps.unitId, ctx.user.unitId), eq(fuelPumps.active, true))
      )
      .orderBy(asc(fuelPumps.number));
    const prices = await db
      .select()
      .from(fuelPrices)
      .where(eq(fuelPrices.unitId, ctx.user.unitId))
      .orderBy(desc(fuelPrices.effectiveAt));
    return pumps.map(p => ({
      ...p,
      priceCents: prices.find(x => x.fuelType === p.fuelType)?.priceCents ?? 0,
    }));
  }),
});

const closureInput = z
  .object({
    closureId: positiveIntegerSchema.optional(),
    closureDate: calendarDateSchema,
    shift: shiftSchema,
    employeeId: positiveIntegerSchema,
    responsibleName: z.string().trim().min(2).max(160),
    notes: z.string().max(4000).default(""),
    changeReason: z.string().trim().max(1000).optional(),
    employeeConfirmed: z.boolean(),
    responsibleConfirmed: z.boolean(),
    nozzles: z
      .array(
        z.object({
          pumpId: positiveIntegerSchema,
          initialReading: z.string(),
          finalReading: z.string(),
        })
      )
      .min(1)
      .max(20),
    payments: z
      .array(
        z.object({
          method: paymentSchema,
          amountCents: integerSchema.min(0).max(100000000),
        })
      )
      .length(4),
    participants: z
      .array(
        z.object({
          employeeId: positiveIntegerSchema,
          sharePercent: z.number().int().min(1).max(100),
        })
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .superRefine((input, ctx) => {
    const participants = input.participants ?? [];
    if (!participants.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message:
          "Informe explicitamente os participantes e o rateio antes de salvar.",
      });
    if (
      new Set(participants.map(person => person.employeeId)).size !==
      participants.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "Não repita funcionários no fechamento.",
      });
    if (!participants.some(person => person.employeeId === input.employeeId))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "O frentista principal precisa estar entre os participantes.",
      });
    if (
      participants.reduce((sum, person) => sum + person.sharePercent, 0) !== 100
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["participants"],
        message: "A soma da participação dos funcionários deve ser 100%.",
      });
  });

const closuresRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          from: calendarDateSchema.optional(),
          to: calendarDateSchema.optional(),
          shift: shiftSchema.optional(),
          status: z.string().optional(),
          includeArchived: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      validatePeriod(input?.from, input?.to);
      if (input?.includeArchived && ctx.user.role !== "administrador")
        throw new TRPCError({ code: "FORBIDDEN" });
      const db = ctx.db;
      const conditions = [
        eq(closures.unitId, ctx.user.unitId),
        input?.includeArchived
          ? isNotNull(closures.deletedAt)
          : isNull(closures.deletedAt),
      ];
      if (input?.from) conditions.push(gte(closures.closureDate, input.from));
      if (input?.to) conditions.push(lte(closures.closureDate, input.to));
      if (input?.shift) conditions.push(eq(closures.shift, input.shift));
      if (
        input?.status &&
        [
          "rascunho",
          "aguardando_conferencia",
          "finalizado",
          "reaberto",
        ].includes(input.status)
      )
        conditions.push(
          eq(
            closures.status,
            input.status as
              | "rascunho"
              | "aguardando_conferencia"
              | "finalizado"
              | "reaberto"
          )
        );
      let ownEmployeeIds: number[] | null = null;
      if (ctx.user.role === "frentista") {
        const ownEmployees = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.unitId, ctx.user.unitId),
              eq(employees.linkedUserId, ctx.user.id)
            )
          );
        ownEmployeeIds = ownEmployees.map(person => person.id);
        const participated = ownEmployeeIds.length
          ? await db
              .select({ closureId: closureParticipants.closureId })
              .from(closureParticipants)
              .where(inArray(closureParticipants.employeeId, ownEmployeeIds))
          : [];
        const permittedClosureIds = [
          ...new Set(participated.map(item => item.closureId)),
        ];
        const ownClosure = permittedClosureIds.length
          ? inArray(closures.id, permittedClosureIds)
          : eq(employees.linkedUserId, ctx.user.id);
        conditions.push(
          or(
            eq(closures.createdBy, ctx.user.id),
            eq(employees.linkedUserId, ctx.user.id),
            ownClosure
          )!
        );
      }
      const all = await db
        .select({ closure: closures, employeeName: employees.fullName })
        .from(closures)
        .leftJoin(employees, eq(closures.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(closures.closureDate), asc(closures.shift))
        .limit(500);
      return all.map(row => ({
        ...row.closure,
        employeeName:
          ownEmployeeIds && !ownEmployeeIds.includes(row.closure.employeeId)
            ? "Fechamento compartilhado"
            : (row.employeeName ?? "Funcionário"),
      }));
    }),
  listPage: protectedProcedure
    .input(
      z.object({
        from: calendarDateSchema.optional(),
        to: calendarDateSchema.optional(),
        shift: shiftSchema.optional(),
        status: z.string().optional(),
        includeArchived: z.boolean().optional(),
        cursor: positiveIntegerSchema.nullish(),
        limit: positiveIntegerSchema.max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      validatePeriod(input.from, input.to);
      if (input.includeArchived && ctx.user.role !== "administrador")
        throw new TRPCError({ code: "FORBIDDEN" });
      const db = ctx.db;
      const conditions = [
        eq(closures.unitId, ctx.user.unitId),
        input.includeArchived
          ? isNotNull(closures.deletedAt)
          : isNull(closures.deletedAt),
      ];
      if (input.from) conditions.push(gte(closures.closureDate, input.from));
      if (input.to) conditions.push(lte(closures.closureDate, input.to));
      if (input.shift) conditions.push(eq(closures.shift, input.shift));
      if (
        input.status &&
        [
          "rascunho",
          "aguardando_conferencia",
          "finalizado",
          "reaberto",
        ].includes(input.status)
      )
        conditions.push(
          eq(
            closures.status,
            input.status as
              | "rascunho"
              | "aguardando_conferencia"
              | "finalizado"
              | "reaberto"
          )
        );
      let ownEmployeeIds: number[] | null = null;
      if (ctx.user.role === "frentista") {
        const ownEmployees = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.unitId, ctx.user.unitId),
              eq(employees.linkedUserId, ctx.user.id)
            )
          );
        ownEmployeeIds = ownEmployees.map(person => person.id);
        const participated = ownEmployeeIds.length
          ? await db
              .select({ closureId: closureParticipants.closureId })
              .from(closureParticipants)
              .where(inArray(closureParticipants.employeeId, ownEmployeeIds))
          : [];
        const permittedClosureIds = [
          ...new Set(participated.map(item => item.closureId)),
        ];
        const ownClosure = permittedClosureIds.length
          ? inArray(closures.id, permittedClosureIds)
          : eq(employees.linkedUserId, ctx.user.id);
        conditions.push(
          or(
            eq(closures.createdBy, ctx.user.id),
            eq(employees.linkedUserId, ctx.user.id),
            ownClosure
          )!
        );
      }
      const cursor = input.cursor ?? 1;
      const rows = await db
        .select({ closure: closures, employeeName: employees.fullName })
        .from(closures)
        .leftJoin(employees, eq(closures.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(closures.closureDate), asc(closures.shift))
        .limit(input.limit + 1)
        .offset((cursor - 1) * input.limit);
      const hasMore = rows.length > input.limit;
      const items = rows.slice(0, input.limit).map(row => ({
        ...row.closure,
        employeeName:
          ownEmployeeIds && !ownEmployeeIds.includes(row.closure.employeeId)
            ? "Fechamento compartilhado"
            : (row.employeeName ?? "Funcionário"),
      }));
      return { items, nextCursor: hasMore ? cursor + 1 : null };
    }),
  detail: protectedProcedure
    .input(z.object({ id: positiveIntegerSchema }))
    .query(async ({ input, ctx }) => {
      const db = ctx.db;
      const [row] = await db
        .select({ closure: closures, employeeName: employees.fullName })
        .from(closures)
        .leftJoin(employees, eq(closures.employeeId, employees.id))
        .where(
          and(
            eq(closures.id, input.id),
            eq(closures.unitId, ctx.user.unitId),
            ctx.user.role === "administrador"
              ? sql`true`
              : isNull(closures.deletedAt)
          )
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      let ownEmployeeIds: number[] | null = null;
      if (ctx.user.role === "frentista") {
        const ownEmployees = await db
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.unitId, ctx.user.unitId),
              eq(employees.linkedUserId, ctx.user.id)
            )
          );
        ownEmployeeIds = ownEmployees.map(person => person.id);
        if (row.closure.createdBy !== ctx.user.id) {
          const primaryMatch = ownEmployeeIds.includes(row.closure.employeeId);
          const participantMatch = ownEmployeeIds.length
            ? await db
                .select({ id: closureParticipants.id })
                .from(closureParticipants)
                .where(
                  and(
                    eq(closureParticipants.closureId, input.id),
                    inArray(closureParticipants.employeeId, ownEmployeeIds)
                  )
                )
                .limit(1)
            : [];
          if (!primaryMatch && !participantMatch.length)
            throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      const [nozzles, payments, participantRows] = await Promise.all([
        db
          .select()
          .from(closureNozzles)
          .where(eq(closureNozzles.closureId, input.id))
          .orderBy(asc(closureNozzles.pumpNumber)),
        db
          .select()
          .from(closurePayments)
          .where(eq(closurePayments.closureId, input.id))
          .orderBy(asc(closurePayments.method)),
        db
          .select({
            employeeId: closureParticipants.employeeId,
            sharePercent: closureParticipants.sharePercent,
            employeeName: employees.fullName,
          })
          .from(closureParticipants)
          .innerJoin(
            employees,
            eq(closureParticipants.employeeId, employees.id)
          )
          .where(eq(closureParticipants.closureId, input.id))
          .orderBy(asc(closureParticipants.employeeId)),
      ]);
      const [unit] = await db
        .select()
        .from(units)
        .where(eq(units.id, ctx.user.unitId))
        .limit(1);
      const visibleParticipants =
        !ownEmployeeIds ||
        (row.closure.status === "rascunho" &&
          row.closure.createdBy === ctx.user.id)
          ? participantRows
          : participantRows.filter(person =>
              ownEmployeeIds.includes(person.employeeId)
            );
      return {
        ...row.closure,
        employeeName:
          ownEmployeeIds && !ownEmployeeIds.includes(row.closure.employeeId)
            ? "Fechamento compartilhado"
            : (row.employeeName ?? "Funcionário"),
        nozzles,
        payments,
        participants: visibleParticipants,
        unit,
      };
    }),
  saveDraft: protectedProcedure
    .input(closureInput)
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const [employee] = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.id, input.employeeId),
            eq(employees.unitId, ctx.user.unitId),
            eq(employees.active, true)
          )
        )
        .limit(1);
      if (!employee)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione um funcionário ativo.",
        });
      if (
        ctx.user.role === "frentista" &&
        employee.linkedUserId !== ctx.user.id
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Você só pode lançar o seu próprio turno.",
        });
      const participants = input.participants ?? [];
      const participantIds = participants.map(person => person.employeeId);
      const activeParticipants = await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.unitId, ctx.user.unitId),
            eq(employees.active, true),
            inArray(employees.id, participantIds)
          )
        );
      if (activeParticipants.length !== participantIds.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Todos os participantes precisam ser funcionários ativos desta unidade.",
        });

      let existing: typeof closures.$inferSelect | undefined;
      let priorNozzles: (typeof closureNozzles.$inferSelect)[] = [];
      let priorPayments: (typeof closurePayments.$inferSelect)[] = [];
      let priorParticipants: (typeof closureParticipants.$inferSelect)[] = [];
      if (input.closureId) {
        const [found] = await db
          .select()
          .from(closures)
          .where(
            and(
              eq(closures.id, input.closureId),
              eq(closures.unitId, ctx.user.unitId),
              isNull(closures.deletedAt)
            )
          )
          .limit(1);
        if (!found) throw new TRPCError({ code: "NOT_FOUND" });
        existing = found;
        if (existing.status !== "rascunho" && existing.status !== "reaberto")
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Somente rascunhos e fechamentos reabertos podem ser alterados.",
          });
        if (
          existing.status === "reaberto" &&
          (!input.changeReason || input.changeReason.trim().length < 5)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Informe uma justificativa de pelo menos 5 caracteres para corrigir um fechamento reaberto.",
          });
        if (
          ctx.user.role === "frentista" &&
          (existing.status !== "rascunho" ||
            existing.createdBy !== ctx.user.id ||
            employee.linkedUserId !== ctx.user.id)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Frentistas só podem continuar os próprios rascunhos.",
          });
        [priorNozzles, priorPayments] = await Promise.all([
          db
            .select()
            .from(closureNozzles)
            .where(eq(closureNozzles.closureId, existing.id)),
          db
            .select()
            .from(closurePayments)
            .where(eq(closurePayments.closureId, existing.id)),
        ]);
        priorParticipants = await db
          .select()
          .from(closureParticipants)
          .where(eq(closureParticipants.closureId, existing.id));
        if (!priorNozzles.length)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "O fechamento não possui leituras históricas para preservar.",
          });
      }

      const pumps = existing
        ? await db
            .select()
            .from(fuelPumps)
            .where(
              and(
                eq(fuelPumps.unitId, ctx.user.unitId),
                inArray(
                  fuelPumps.id,
                  priorNozzles.map(n => n.pumpId)
                )
              )
            )
        : await db
            .select()
            .from(fuelPumps)
            .where(
              and(
                eq(fuelPumps.unitId, ctx.user.unitId),
                eq(fuelPumps.active, true)
              )
            );
      const currentPrices = await db
        .select()
        .from(fuelPrices)
        .where(eq(fuelPrices.unitId, ctx.user.unitId))
        .orderBy(desc(fuelPrices.effectiveAt));
      const [tolRow] = await db
        .select()
        .from(unitSettings)
        .where(
          and(
            eq(unitSettings.unitId, ctx.user.unitId),
            eq(unitSettings.settingKey, "toleranceCents")
          )
        )
        .limit(1);
      const toleranceCents =
        existing?.toleranceCents ?? Number(tolRow?.settingValue ?? 0);
      checkedInteger(
        toleranceCents,
        "A tolerância excede o limite inteiro permitido pelo PostgreSQL."
      );
      if (
        !pumps.length ||
        input.nozzles.length !== pumps.length ||
        new Set(input.nozzles.map(n => n.pumpId)).size !== pumps.length ||
        pumps.some(p => !input.nozzles.some(n => n.pumpId === p.id))
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe as leituras de todos os bicos do fechamento.",
        });

      const nozzleValues = input.nozzles.map(n => {
        const pump = pumps.find(p => p.id === n.pumpId)!;
        const initialMilli = parseReading(n.initialReading);
        const finalMilli = parseReading(n.finalReading);
        if (finalMilli < initialMilli)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${pump.number}: a leitura final não pode ser menor que a inicial.`,
          });
        const litersMilli = finalMilli - initialMilli;
        const priceCents = existing
          ? (priorNozzles.find(previous => previous.pumpId === pump.id)
              ?.priceCents ?? 0)
          : (currentPrices.find(price => price.fuelType === pump.fuelType)
              ?.priceCents ?? 0);
        const valueCents = checkedInteger(
          Math.round((litersMilli * priceCents) / 1000),
          `${pump.number}: o valor calculado excede o limite inteiro permitido pelo PostgreSQL.`
        );
        return {
          pumpId: pump.id,
          pumpNumber: pump.number,
          fuelType: pump.fuelType,
          initialReading: (initialMilli / 1000).toFixed(3),
          finalReading: (finalMilli / 1000).toFixed(3),
          liters: (litersMilli / 1000).toFixed(3),
          priceCents,
          valueCents,
        };
      });
      const salesCents = checkedInteger(
        nozzleValues.reduce((sum, n) => sum + n.valueCents, 0),
        "O total de vendas excede o limite inteiro permitido pelo PostgreSQL."
      );
      const receivedCents = checkedInteger(
        input.payments.reduce((sum, p) => sum + p.amountCents, 0),
        "O total recebido excede o limite inteiro permitido pelo PostgreSQL."
      );
      const differenceCents = checkedInteger(
        receivedCents - salesCents,
        "A diferença calculada excede o limite inteiro permitido pelo PostgreSQL."
      );
      const result = classify(differenceCents, toleranceCents);
      const [existingForShift] = await db
        .select()
        .from(closures)
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            eq(closures.closureDate, input.closureDate),
            eq(closures.shift, input.shift),
            isNull(closures.deletedAt)
          )
        )
        .limit(1);
      if (existingForShift && existingForShift.id !== existing?.id)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um fechamento para esta data e turno.",
        });

      if (existing) {
        const changeReason = input.changeReason?.trim() ?? "";
        const changes: Array<{
          field: string;
          beforeValue: string;
          afterValue: string;
        }> = [];
        const recordChange = (
          field: string,
          before: unknown,
          after: unknown
        ) => {
          const beforeValue = JSON.stringify(before ?? null);
          const afterValue = JSON.stringify(after ?? null);
          if (beforeValue !== afterValue)
            changes.push({ field, beforeValue, afterValue });
        };
        recordChange("closureDate", existing.closureDate, input.closureDate);
        recordChange("shift", existing.shift, input.shift);
        recordChange("employeeId", existing.employeeId, input.employeeId);
        recordChange(
          "responsibleName",
          existing.responsibleName,
          input.responsibleName
        );
        recordChange("notes", existing.notes, input.notes);
        recordChange(
          "employeeConfirmed",
          existing.employeeConfirmed,
          input.employeeConfirmed
        );
        recordChange(
          "responsibleConfirmed",
          existing.responsibleConfirmed,
          input.responsibleConfirmed
        );
        recordChange("salesCents", existing.salesCents, salesCents);
        recordChange("receivedCents", existing.receivedCents, receivedCents);
        recordChange(
          "differenceCents",
          existing.differenceCents,
          differenceCents
        );
        recordChange("toleranceCents", existing.toleranceCents, toleranceCents);
        recordChange("result", existing.result, result);
        const oldNozzles = priorNozzles
          .map(n => ({
            pumpId: n.pumpId,
            pumpNumber: n.pumpNumber,
            fuelType: n.fuelType,
            initialReading: n.initialReading,
            finalReading: n.finalReading,
            liters: n.liters,
            priceCents: n.priceCents,
            valueCents: n.valueCents,
          }))
          .sort((a, b) => a.pumpId - b.pumpId);
        const newNozzles = nozzleValues
          .map(n => ({ ...n }))
          .sort((a, b) => a.pumpId - b.pumpId);
        recordChange("nozzles", oldNozzles, newNozzles);
        const oldPayments = priorPayments
          .map(p => ({ method: p.method, amountCents: p.amountCents }))
          .sort((a, b) => a.method.localeCompare(b.method));
        const newPayments = input.payments
          .map(p => ({ method: p.method, amountCents: p.amountCents }))
          .sort((a, b) => a.method.localeCompare(b.method));
        recordChange("payments", oldPayments, newPayments);
        const oldParticipants = priorParticipants
          .map(person => ({
            employeeId: person.employeeId,
            sharePercent: person.sharePercent,
          }))
          .sort((a, b) => a.employeeId - b.employeeId);
        const newParticipants = participants
          .map(person => ({
            employeeId: person.employeeId,
            sharePercent: person.sharePercent,
          }))
          .sort((a, b) => a.employeeId - b.employeeId);
        recordChange("participants", oldParticipants, newParticipants);
        recordChange("status", existing.status, "rascunho");
        const auditRows = changes.length
          ? changes
          : [{ field: "", beforeValue: "", afterValue: "" }];
        try {
          await db.transaction(async tx => {
            const [lockedExisting] = await tx
              .select()
              .from(closures)
              .where(
                and(
                  eq(closures.id, existing!.id),
                  eq(closures.unitId, ctx.user.unitId)
                )
              )
              .limit(1)
              .for("update");
            if (!lockedExisting) throw new TRPCError({ code: "NOT_FOUND" });
            if (
              lockedExisting.revision !== existing!.revision ||
              lockedExisting.deletedAt !== null ||
              (lockedExisting.status !== "rascunho" &&
                lockedExisting.status !== "reaberto")
            )
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "Somente rascunhos e fechamentos reabertos podem ser alterados.",
              });
            existing = lockedExisting;
            await tx
              .update(closures)
              .set({
                closureDate: input.closureDate,
                shift: input.shift,
                employeeId: input.employeeId,
                responsibleName: input.responsibleName,
                notes: input.notes,
                employeeConfirmed: input.employeeConfirmed,
                responsibleConfirmed: input.responsibleConfirmed,
                salesCents,
                receivedCents,
                differenceCents,
                toleranceCents,
                result,
                status: "rascunho",
                revision: existing!.revision + 1,
              })
              .where(eq(closures.id, existing!.id));
            await tx
              .delete(closureNozzles)
              .where(eq(closureNozzles.closureId, existing!.id));
            await tx
              .delete(closurePayments)
              .where(eq(closurePayments.closureId, existing!.id));
            await tx
              .delete(closureParticipants)
              .where(eq(closureParticipants.closureId, existing!.id));
            await tx
              .insert(closureNozzles)
              .values(
                nozzleValues.map(n => ({ ...n, closureId: existing!.id }))
              );
            await tx
              .insert(closurePayments)
              .values(
                input.payments.map(p => ({ ...p, closureId: existing!.id }))
              );
            await tx.insert(closureParticipants).values(
              participants.map(person => ({
                ...person,
                closureId: existing!.id,
              }))
            );
            await tx.insert(auditEvents).values(
              auditRows.map(change => ({
                unitId: ctx.user.unitId,
                userId: ctx.user.id,
                targetType: "closure",
                targetId: existing!.id,
                action: changes.length ? "closure_updated" : "closure_saved",
                field: change.field || null,
                beforeValue: change.beforeValue || null,
                afterValue: change.afterValue || null,
                reason: changeReason || null,
              }))
            );
          });
        } catch (error) {
          if (isUniqueViolation(error))
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe um fechamento para esta data e turno.",
            });
          throw error;
        }
        return {
          id: existing.id,
          salesCents,
          receivedCents,
          differenceCents,
          result,
        };
      }

      let saved: number;
      try {
        saved = await db.transaction(async tx => {
          const [inserted] = await tx
            .insert(closures)
            .values({
              unitId: ctx.user.unitId,
              closureDate: input.closureDate,
              shift: input.shift,
              employeeId: input.employeeId,
              responsibleName: input.responsibleName,
              createdBy: ctx.user.id,
              status: "rascunho",
              result,
              salesCents,
              receivedCents,
              differenceCents,
              toleranceCents,
              notes: input.notes,
              employeeConfirmed: input.employeeConfirmed,
              responsibleConfirmed: input.responsibleConfirmed,
            })
            .returning({ id: closures.id });
          const id = inserted.id;
          await tx
            .insert(closureNozzles)
            .values(nozzleValues.map(n => ({ ...n, closureId: id })));
          await tx
            .insert(closurePayments)
            .values(input.payments.map(p => ({ ...p, closureId: id })));
          await tx
            .insert(closureParticipants)
            .values(participants.map(person => ({ ...person, closureId: id })));
          await tx.insert(auditEvents).values({
            unitId: ctx.user.unitId,
            userId: ctx.user.id,
            targetType: "closure",
            targetId: id,
            action: "created",
            field: "status",
            beforeValue: null,
            afterValue: "rascunho",
            reason: null,
          });
          return id;
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um fechamento para esta data e turno.",
          });
        throw error;
      }
      return { id: saved, salesCents, receivedCents, differenceCents, result };
    }),
  finalize: protectedProcedure
    .input(z.object({ id: positiveIntegerSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      const finalStatus = await db.transaction(async tx => {
        const [closure] = await tx
          .select()
          .from(closures)
          .where(
            and(eq(closures.id, input.id), eq(closures.unitId, ctx.user.unitId))
          )
          .limit(1)
          .for("update");
        if (!closure) throw new TRPCError({ code: "NOT_FOUND" });
        if (closure.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
        if (
          closure.status === "finalizado" ||
          closure.status === "aguardando_conferencia"
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este fechamento já foi enviado.",
          });
        if (closure.status !== "rascunho")
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Salve primeiro as alterações do fechamento reaberto antes de finalizar.",
          });
        if (ctx.user.role === "frentista" && closure.createdBy !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN" });
        if (!closure.employeeConfirmed || !closure.responsibleConfirmed)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Confirme as responsabilidades antes de enviar.",
          });
        const status: "aguardando_conferencia" | "finalizado" =
          ctx.user.role === "frentista"
            ? "aguardando_conferencia"
            : "finalizado";
        await tx
          .update(closures)
          .set({
            status,
            finalizedAt: status === "finalizado" ? new Date() : null,
          })
          .where(eq(closures.id, input.id));
        if (status === "finalizado")
          await syncFinalizedClosure(tx, {
            closureId: input.id,
            unitId: ctx.user.unitId,
            userId: ctx.user.id,
          });
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "closure",
          targetId: input.id,
          action: "submitted",
          field: "status",
          beforeValue: closure.status,
          afterValue: status,
          reason:
            status === "finalizado"
              ? "Finalizado pelo responsável"
              : "Aguardando conferência gerencial",
        });
        return status;
      });
      return { success: true, status: finalStatus };
    }),
  confirm: managerProcedure
    .input(
      z
        .object({
          id: positiveIntegerSchema,
          participants: z
            .array(
              z.object({
                employeeId: positiveIntegerSchema,
                sharePercent: z.number().int().min(1).max(100),
              })
            )
            .min(1)
            .max(10),
        })
        .superRefine((input, issueContext) => {
          if (
            new Set(input.participants.map(person => person.employeeId))
              .size !== input.participants.length
          ) {
            issueContext.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["participants"],
              message: "Não repita funcionários no rateio confirmado.",
            });
          }
          if (
            input.participants.reduce(
              (sum, person) => sum + person.sharePercent,
              0
            ) !== 100
          ) {
            issueContext.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["participants"],
              message: "O rateio confirmado deve totalizar 100%.",
            });
          }
        })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      await db.transaction(async tx => {
        const [closure] = await tx
          .select()
          .from(closures)
          .where(
            and(eq(closures.id, input.id), eq(closures.unitId, ctx.user.unitId))
          )
          .limit(1)
          .for("update");
        if (
          !closure ||
          closure.deletedAt ||
          closure.status !== "aguardando_conferencia"
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Fechamento não está aguardando conferência.",
          });
        if (
          !input.participants.some(
            person => person.employeeId === closure.employeeId
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O frentista principal deve estar incluído no rateio confirmado.",
          });
        }
        const participantIds = input.participants.map(
          person => person.employeeId
        );
        const activeParticipants = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(
            and(
              eq(employees.unitId, ctx.user.unitId),
              eq(employees.active, true),
              inArray(employees.id, participantIds)
            )
          );
        if (activeParticipants.length !== participantIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Todos os participantes confirmados precisam ser funcionários ativos desta unidade.",
          });
        }
        const previousParticipants = await tx
          .select({
            employeeId: closureParticipants.employeeId,
            sharePercent: closureParticipants.sharePercent,
          })
          .from(closureParticipants)
          .where(eq(closureParticipants.closureId, input.id))
          .orderBy(asc(closureParticipants.employeeId));
        const confirmedParticipants = [...input.participants].sort(
          (a, b) => a.employeeId - b.employeeId
        );
        await tx
          .delete(closureParticipants)
          .where(eq(closureParticipants.closureId, input.id));
        await tx.insert(closureParticipants).values(
          confirmedParticipants.map(person => ({
            ...person,
            closureId: input.id,
          }))
        );
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "closure",
          targetId: input.id,
          action: "participants_confirmed",
          field: "participants",
          beforeValue: JSON.stringify(previousParticipants),
          afterValue: JSON.stringify(confirmedParticipants),
          reason:
            "Rateio explícito revisado e confirmado por gerente antes da finalização.",
        });
        await tx
          .update(closures)
          .set({ status: "finalizado", finalizedAt: new Date() })
          .where(eq(closures.id, input.id));
        await syncFinalizedClosure(tx, {
          closureId: input.id,
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
        });
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "closure",
          targetId: input.id,
          action: "confirmed",
          field: "status",
          beforeValue: "aguardando_conferencia",
          afterValue: "finalizado",
          reason: null,
        });
      });
      return { success: true };
    }),
  reopen: adminProcedure
    .input(
      z.object({
        id: positiveIntegerSchema,
        reason: z.string().trim().min(5).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db;
      await db.transaction(async tx => {
        const [closure] = await tx
          .select()
          .from(closures)
          .where(
            and(eq(closures.id, input.id), eq(closures.unitId, ctx.user.unitId))
          )
          .limit(1)
          .for("update");
        if (!closure || closure.deletedAt || closure.status !== "finalizado")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Somente fechamentos finalizados podem ser reabertos.",
          });
        await tx
          .update(closures)
          .set({
            status: "reaberto",
            reopenedAt: new Date(),
            finalizedAt: null,
          })
          .where(eq(closures.id, input.id));
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "closure",
          targetId: input.id,
          action: "reopened",
          field: "status",
          beforeValue: "finalizado",
          afterValue: "reaberto",
          reason: input.reason,
        });
      });
      return { success: true };
    }),
  archiveDraft: adminProcedure
    .input(
      z.object({
        id: positiveIntegerSchema,
        reason: z.string().trim().min(5).max(1000),
        confirmation: z.literal("EXCLUIR"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const archivedAt = new Date();
      await ctx.db.transaction(async tx => {
        const [closure] = await tx
          .select()
          .from(closures)
          .where(
            and(
              eq(closures.id, input.id),
              eq(closures.unitId, ctx.user.unitId),
              isNull(closures.deletedAt)
            )
          )
          .limit(1)
          .for("update");
        if (!closure) throw new TRPCError({ code: "NOT_FOUND" });
        const [movement, discrepancy] = await Promise.all([
          tx
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.sourceClosureId, closure.id))
            .limit(1),
          tx
            .select({ id: discrepancyCases.id })
            .from(discrepancyCases)
            .where(eq(discrepancyCases.closureId, closure.id))
            .limit(1),
        ]);
        if (
          !isClosureArchivable({
            status: closure.status,
            finalizedAt: closure.finalizedAt,
            reopenedAt: closure.reopenedAt,
            hasStockMovement: movement.length > 0,
            hasDiscrepancyCase: discrepancy.length > 0,
          })
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Somente rascunhos nunca finalizados ou reabertos e sem vínculo a estoque ou divergências podem ser arquivados.",
          });
        await tx
          .update(closures)
          .set({ deletedAt: archivedAt })
          .where(
            and(
              eq(closures.id, closure.id),
              eq(closures.unitId, ctx.user.unitId),
              isNull(closures.deletedAt)
            )
          );
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "closure",
          targetId: closure.id,
          action: "closure_archived",
          field: "deletedAt",
          beforeValue: null,
          afterValue: archivedAt.toISOString(),
          reason: input.reason,
        });
      });
      return { success: true, deletedAt: archivedAt };
    }),
  restoreDraft: adminProcedure
    .input(
      z.object({
        id: positiveIntegerSchema,
        reason: z.string().trim().min(5).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.transaction(async tx => {
          const [closure] = await tx
            .select()
            .from(closures)
            .where(
              and(
                eq(closures.id, input.id),
                eq(closures.unitId, ctx.user.unitId),
                isNotNull(closures.deletedAt)
              )
            )
            .limit(1)
            .for("update");
          if (!closure) throw new TRPCError({ code: "NOT_FOUND" });
          const [movement, discrepancy] = await Promise.all([
            tx
              .select({ id: stockMovements.id })
              .from(stockMovements)
              .where(eq(stockMovements.sourceClosureId, closure.id))
              .limit(1),
            tx
              .select({ id: discrepancyCases.id })
              .from(discrepancyCases)
              .where(eq(discrepancyCases.closureId, closure.id))
              .limit(1),
          ]);
          if (
            !isClosureArchivable({
              status: closure.status,
              finalizedAt: closure.finalizedAt,
              reopenedAt: closure.reopenedAt,
              hasStockMovement: movement.length > 0,
              hasDiscrepancyCase: discrepancy.length > 0,
            })
          )
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Este registro não pode ser restaurado porque não atende mais à política de rascunhos arquivados.",
            });
          await tx
            .update(closures)
            .set({ deletedAt: null })
            .where(
              and(
                eq(closures.id, closure.id),
                eq(closures.unitId, ctx.user.unitId),
                isNotNull(closures.deletedAt)
              )
            );
          await tx.insert(auditEvents).values({
            unitId: ctx.user.unitId,
            userId: ctx.user.id,
            targetType: "closure",
            targetId: closure.id,
            action: "closure_restored",
            field: "deletedAt",
            beforeValue: closure.deletedAt?.toISOString() ?? null,
            afterValue: null,
            reason: input.reason,
          });
        });
        return { success: true };
      } catch (error) {
        if (isUniqueViolation(error))
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Não é possível restaurar: já existe um fechamento ativo para esta unidade, data e turno.",
          });
        throw error;
      }
    }),
});

const analyticsRouter = router({
  dashboard: managerProcedure
    .input(
      z
        .object({
          from: calendarDateSchema.optional(),
          to: calendarDateSchema.optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      validatePeriod(input?.from, input?.to);
      const db = ctx.db;
      const businessToday = businessDateInSaoPaulo();
      const cond = [
        eq(closures.unitId, ctx.user.unitId),
        eq(closures.status, "finalizado" as const),
        isNull(closures.deletedAt),
      ];
      if (input?.from) cond.push(gte(closures.closureDate, input.from));
      if (input?.to) cond.push(lte(closures.closureDate, input.to));
      const [rows, today] = await Promise.all([
        db
          .select()
          .from(closures)
          .where(and(...cond))
          .orderBy(asc(closures.closureDate)),
        db
          .select()
          .from(closures)
          .where(
            and(
              eq(closures.unitId, ctx.user.unitId),
              eq(closures.status, "finalizado"),
              isNull(closures.deletedAt),
              eq(closures.closureDate, businessToday)
            )
          ),
      ]);
      const start = input?.from ?? businessToday;
      const end = input?.to ?? businessToday;
      const all = rows.filter(
        r => r.closureDate >= start && r.closureDate <= end
      );
      const total = (arr: typeof rows, key: "salesCents" | "receivedCents") =>
        arr.reduce((sum, r) => sum + r[key], 0);
      const nozzles = all.length
        ? await db
            .select({
              closureId: closureNozzles.closureId,
              fuelType: closureNozzles.fuelType,
              liters: closureNozzles.liters,
              valueCents: closureNozzles.valueCents,
            })
            .from(closureNozzles)
            .innerJoin(closures, eq(closureNozzles.closureId, closures.id))
            .where(
              and(
                eq(closures.unitId, ctx.user.unitId),
                eq(closures.status, "finalizado" as const),
                isNull(closures.deletedAt),
                gte(closures.closureDate, start),
                lte(closures.closureDate, end)
              )
            )
        : [];
      const payments = all.length
        ? await db
            .select({
              method: closurePayments.method,
              amountCents: closurePayments.amountCents,
            })
            .from(closurePayments)
            .innerJoin(closures, eq(closurePayments.closureId, closures.id))
            .where(
              and(
                eq(closures.unitId, ctx.user.unitId),
                eq(closures.status, "finalizado" as const),
                isNull(closures.deletedAt),
                gte(closures.closureDate, start),
                lte(closures.closureDate, end)
              )
            )
        : [];
      const todayNozzles = today.length
        ? await db
            .select({ liters: closureNozzles.liters })
            .from(closureNozzles)
            .innerJoin(closures, eq(closureNozzles.closureId, closures.id))
            .where(
              and(
                eq(closures.unitId, ctx.user.unitId),
                eq(closures.status, "finalizado" as const),
                isNull(closures.deletedAt),
                eq(closures.closureDate, businessToday)
              )
            )
        : [];
      const shifts = ["manha", "tarde", "noite"] as const;
      const todayStatuses = await db
        .select({
          shift: closures.shift,
          status: closures.status,
          result: closures.result,
        })
        .from(closures)
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            eq(closures.closureDate, businessToday),
            isNull(closures.deletedAt)
          )
        );
      const pendingRows = await db
        .select({
          status: closures.status,
          result: closures.result,
          differenceCents: closures.differenceCents,
        })
        .from(closures)
        .where(
          and(
            eq(closures.unitId, ctx.user.unitId),
            gte(closures.closureDate, start),
            lte(closures.closureDate, end),
            isNull(closures.deletedAt)
          )
        );
      const byDay = new Map<string, number>();
      all.forEach(r =>
        byDay.set(r.closureDate, (byDay.get(r.closureDate) ?? 0) + r.salesCents)
      );
      const fuelStats = {
        gasolina_comum: { liters: 0, valueCents: 0 },
        diesel_s10: { liters: 0, valueCents: 0 },
      };
      nozzles.forEach(n => {
        fuelStats[n.fuelType].liters += Number(n.liters);
        fuelStats[n.fuelType].valueCents += n.valueCents;
      });
      const paymentStats = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
      payments.forEach(p => {
        paymentStats[p.method] += p.amountCents;
      });
      const todayLiters = todayNozzles.reduce(
        (sum, nozzle) => sum + Number(nozzle.liters),
        0
      );
      const surplusCents = all
        .filter(r => r.result === "sobra")
        .reduce((sum, r) => sum + r.differenceCents, 0);
      const shortageCents = Math.abs(
        all
          .filter(r => r.result === "falta")
          .reduce((sum, r) => sum + r.differenceCents, 0)
      );
      const netCashBalanceCents = surplusCents - shortageCents;
      return {
        totals: {
          todaySalesCents: total(today, "salesCents"),
          monthSalesCents: total(all, "salesCents"),
          todayReceivedCents: total(today, "receivedCents"),
          monthReceivedCents: total(all, "receivedCents"),
          monthLiters:
            fuelStats.gasolina_comum.liters + fuelStats.diesel_s10.liters,
          todayLiters,
          finalizedCount: all.length,
          pendingCount: pendingRows.filter(
            r =>
              r.status === "aguardando_conferencia" || r.status === "rascunho"
          ).length,
          confirmedCount: all.filter(r => r.result === "conferido").length,
          discrepancyCount: all.filter(
            r => r.result === "sobra" || r.result === "falta"
          ).length,
          surplusCents,
          shortageCents,
          netCashBalanceCents,
        },
        byDay: [...byDay].map(([date, salesCents]) => ({ date, salesCents })),
        fuelStats,
        paymentStats,
        shifts: shifts.map(shift => ({
          shift,
          status:
            todayStatuses.find(s => s.shift === shift)?.status ??
            "nao_iniciado",
          result:
            todayStatuses.find(s => s.shift === shift)?.result ?? "pendente",
        })),
      };
    }),
  report: managerProcedure
    .input(
      z
        .object({
          from: calendarDateSchema.optional(),
          to: calendarDateSchema.optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      validatePeriod(input?.from, input?.to);
      const db = ctx.db;
      const conditions = [
        eq(closures.unitId, ctx.user.unitId),
        isNull(closures.deletedAt),
      ];
      if (input?.from) conditions.push(gte(closures.closureDate, input.from));
      if (input?.to) conditions.push(lte(closures.closureDate, input.to));
      const rows = await db
        .select({ closure: closures, employeeName: employees.fullName })
        .from(closures)
        .leftJoin(employees, eq(closures.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(closures.closureDate));
      return rows.map(r => ({
        ...r.closure,
        employeeName: r.employeeName ?? "Funcionário",
      }));
    }),
});

const auditRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    return db
      .select({
        event: auditEvents,
        username: appUsers.username,
        fullName: appUsers.fullName,
      })
      .from(auditEvents)
      .innerJoin(appUsers, eq(auditEvents.userId, appUsers.id))
      .where(eq(auditEvents.unitId, ctx.user.unitId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(300);
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  employees: employeesRouter,
  users: usersRouter,
  settings: settingsRouter,
  closures: closuresRouter,
  analytics: analyticsRouter,
  inventory: inventoryRouter,
  discrepancies: discrepanciesRouter,
  audit: auditRouter,
});
export type AppRouter = typeof appRouter;
