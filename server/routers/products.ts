import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  auditEvents,
  closures,
  closureParticipants,
  employees,
  productSaleItems,
  productSales,
  products,
  unitSettings,
} from "../../drizzle/schema.pg";
import { businessDateInSaoPaulo, isValidCalendarDate } from "../../shared/businessDate";
import { calculateSaleLine, sumSaleLines } from "../../shared/productSales";
import { managerProcedure, protectedProcedure, router } from "../_core/trpc";

const MAX_INTEGER = 2_147_483_647;
const positiveId = z.number().int().positive().max(MAX_INTEGER);
const dateSchema = z.string().refine(isValidCalendarDate, "Data inválida.");
const shiftSchema = z.enum(["manha", "tarde", "noite"]);
const commissionModeSchema = z.enum(["none", "percent", "fixed"]);
const commissionSettingKey = "productCommissionsEnabled";

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: string }).code === "23505";
}

function classify(differenceCents: number, toleranceCents: number) {
  return Math.abs(differenceCents) <= toleranceCents
    ? "conferido" as const
    : differenceCents > 0
      ? "sobra" as const
      : "falta" as const;
}

function checkedTotal(value: number, message: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_INTEGER)
    throw new TRPCError({ code: "BAD_REQUEST", message });
  return value;
}

export const productsRouter = router({
  catalog: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(products).where(and(
      eq(products.unitId, ctx.user.unitId),
      eq(products.active, true)
    )).orderBy(asc(products.name)).limit(2_000);
    return rows.map(({ commissionMode, commissionValue, ...product }) => product);
  }),

  slot: protectedProcedure.input(z.object({ date: dateSchema, shift: shiftSchema }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "frentista") {
        const [closure] = await ctx.db.select().from(closures).where(and(
          eq(closures.unitId, ctx.user.unitId),
          eq(closures.closureDate, input.date),
          eq(closures.shift, input.shift),
          isNull(closures.deletedAt)
        )).limit(1);
        if (!closure) {
          if (input.date !== businessDateInSaoPaulo())
            throw new TRPCError({ code: "FORBIDDEN", message: "Frentistas só podem consultar vendas do turno atual ou de um fechamento ao qual tenham acesso." });
        } else if (closure.createdBy !== ctx.user.id) {
          const ownEmployees = await ctx.db.select({ id: employees.id }).from(employees).where(and(
            eq(employees.unitId, ctx.user.unitId),
            eq(employees.linkedUserId, ctx.user.id)
          ));
          const ownIds = ownEmployees.map(employee => employee.id);
          const primaryMatch = ownIds.includes(closure.employeeId);
          const [participation] = ownIds.length ? await ctx.db.select({ id: closureParticipants.id })
            .from(closureParticipants).where(and(
              eq(closureParticipants.closureId, closure.id),
              or(...ownIds.map(id => eq(closureParticipants.employeeId, id)))!
            )).limit(1) : [];
          if (!primaryMatch && !participation)
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso às vendas deste fechamento." });
        }
      }
      const rows = await ctx.db.select({ sale: productSales, item: productSaleItems })
        .from(productSales)
        .innerJoin(productSaleItems, eq(productSaleItems.saleId, productSales.id))
        .where(and(
          eq(productSales.unitId, ctx.user.unitId),
          eq(productSales.closureDate, input.date),
          eq(productSales.shift, input.shift),
          isNull(productSales.canceledAt)
        ))
        .orderBy(desc(productSales.createdAt), asc(productSaleItems.id));
      return {
        totalCents: checkedTotal(
          rows.reduce((sum, row) => sum + row.item.totalCents, 0),
          "O total de produtos excede o limite permitido."
        ),
        items: rows.map(({ sale, item }) => ({
          saleId: sale.id,
          item,
        })),
      };
    }),

  list: managerProcedure.query(async ({ ctx }) => ctx.db.select().from(products)
    .where(eq(products.unitId, ctx.user.unitId))
    .orderBy(asc(products.name))
    .limit(2_000)),

  commissionStatus: protectedProcedure.query(async ({ ctx }) => {
    const [setting] = await ctx.db.select({ value: unitSettings.settingValue })
      .from(unitSettings).where(and(
        eq(unitSettings.unitId, ctx.user.unitId),
        eq(unitSettings.settingKey, commissionSettingKey)
      )).limit(1);
    return { enabled: setting?.value === "true" };
  }),

  save: managerProcedure.input(z.object({
    id: positiveId.optional(),
    barcode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(120).nullable().optional(),
    category: z.string().trim().max(120).nullable().optional(),
    specification: z.string().trim().max(240).nullable().optional(),
    priceCents: z.number().int().min(0).max(MAX_INTEGER),
    commissionMode: commissionModeSchema.default("none"),
    commissionValue: z.number().int().min(0).max(MAX_INTEGER).default(0),
  }).superRefine((input, issue) => {
    if (input.commissionMode === "none" && input.commissionValue !== 0)
      issue.addIssue({ code: "custom", path: ["commissionValue"], message: "Comissão desativada deve ter valor zero." });
    if (input.commissionMode === "fixed" && input.commissionValue > MAX_INTEGER)
      issue.addIssue({ code: "custom", path: ["commissionValue"], message: "Valor de comissão inválido." });
    if (input.commissionMode === "percent" && input.commissionValue > 10_000)
      issue.addIssue({ code: "custom", path: ["commissionValue"], message: "A comissão percentual deve estar entre 0 e 10.000 pontos-base." });
  })).mutation(async ({ input, ctx }) => {
    const values = {
      unitId: ctx.user.unitId,
      barcode: input.barcode,
      name: input.name,
      brand: input.brand?.trim() || null,
      category: input.category?.trim() || null,
      specification: input.specification?.trim() || null,
      priceCents: input.priceCents,
      commissionMode: input.commissionMode,
      commissionValue: input.commissionMode === "none" ? 0 : input.commissionValue,
      updatedAt: new Date(),
    };
    try {
      return await ctx.db.transaction(async tx => {
        let productId = input.id;
        let previous: typeof products.$inferSelect | undefined;
        if (productId) {
          [previous] = await tx.select().from(products).where(and(
            eq(products.id, productId), eq(products.unitId, ctx.user.unitId)
          )).limit(1).for("update");
          if (!previous) throw new TRPCError({ code: "NOT_FOUND" });
          await tx.update(products).set(values).where(eq(products.id, productId));
        } else {
          const [created] = await tx.insert(products).values({
            ...values,
            createdBy: ctx.user.id,
          }).returning({ id: products.id });
          productId = created.id;
        }
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "product",
          targetId: productId,
          action: previous ? "product_updated" : "product_created",
          field: "catalog",
          beforeValue: previous ? JSON.stringify({ barcode: previous.barcode, name: previous.name, priceCents: previous.priceCents, commissionMode: previous.commissionMode, commissionValue: previous.commissionValue }) : null,
          afterValue: JSON.stringify(values),
          reason: null,
        });
        const [saved] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
        return saved;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "Já existe produto com este código de barras nesta unidade." });
      throw error;
    }
  }),

  setActive: managerProcedure.input(z.object({ id: positiveId, active: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async tx => {
        const [product] = await tx.select().from(products).where(and(
          eq(products.id, input.id), eq(products.unitId, ctx.user.unitId)
        )).limit(1).for("update");
        if (!product) throw new TRPCError({ code: "NOT_FOUND" });
        if (product.active === input.active) return;
        await tx.update(products).set({ active: input.active, updatedAt: new Date() }).where(eq(products.id, input.id));
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "product",
          targetId: input.id,
          action: input.active ? "product_activated" : "product_deactivated",
          field: "active",
          beforeValue: String(product.active),
          afterValue: String(input.active),
          reason: null,
        });
      });
      return { success: true };
    }),

  setCommissionsEnabled: managerProcedure.input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async tx => {
        const [previous] = await tx.select().from(unitSettings).where(and(
          eq(unitSettings.unitId, ctx.user.unitId),
          eq(unitSettings.settingKey, commissionSettingKey)
        )).limit(1).for("update");
        await tx.insert(unitSettings).values({
          unitId: ctx.user.unitId,
          settingKey: commissionSettingKey,
          settingValue: String(input.enabled),
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [unitSettings.unitId, unitSettings.settingKey],
          set: { settingValue: String(input.enabled), updatedBy: ctx.user.id, updatedAt: new Date() },
        });
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "unitSettings",
          targetId: ctx.user.unitId,
          action: "product_commission_setting_changed",
          field: commissionSettingKey,
          beforeValue: previous?.settingValue ?? "false",
          afterValue: String(input.enabled),
          reason: null,
        });
      });
      return { enabled: input.enabled };
    }),

  createSale: protectedProcedure.input(z.object({
    closureDate: dateSchema,
    shift: shiftSchema,
    idempotencyKey: z.string().uuid(),
    items: z.array(z.object({ productId: positiveId, quantity: z.number().int().min(1).max(10_000) })).min(1).max(100),
  })).mutation(async ({ input, ctx }) => {
    if (input.closureDate !== businessDateInSaoPaulo())
      throw new TRPCError({ code: "BAD_REQUEST", message: "As vendas devem ser registradas na data operacional atual." });
    const itemIds = input.items.map(item => item.productId);
    if (new Set(itemIds).size !== itemIds.length)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Consolide as quantidades de cada produto antes de confirmar." });
    try {
      return await ctx.db.transaction(async tx => {
        const [existingSale] = await tx.select({ id: productSales.id, totalCents: productSales.totalCents })
          .from(productSales).where(and(
            eq(productSales.unitId, ctx.user.unitId),
            eq(productSales.idempotencyKey, input.idempotencyKey)
          )).limit(1);
        if (existingSale) return { ...existingSale, repeated: true };

        const [employee] = await tx.select().from(employees).where(and(
          eq(employees.unitId, ctx.user.unitId),
          eq(employees.linkedUserId, ctx.user.id),
          eq(employees.active, true)
        )).limit(1);
        if (!employee)
          throw new TRPCError({ code: "FORBIDDEN", message: "Sua conta precisa estar vinculada a um funcionário ativo desta unidade para registrar vendas." });

        const [closure] = await tx.select().from(closures).where(and(
          eq(closures.unitId, ctx.user.unitId),
          eq(closures.closureDate, input.closureDate),
          eq(closures.shift, input.shift),
          isNull(closures.deletedAt)
        )).limit(1).for("update");
        if (!closure) {
          const [archived] = await tx.select({ id: closures.id }).from(closures).where(and(
            eq(closures.unitId, ctx.user.unitId),
            eq(closures.closureDate, input.closureDate),
            eq(closures.shift, input.shift),
            isNotNull(closures.deletedAt)
          )).limit(1);
          if (archived)
            throw new TRPCError({ code: "CONFLICT", message: "O turno foi arquivado; não são aceitas novas vendas." });
        }
        if (closure && closure.status !== "rascunho" && closure.status !== "reaberto")
          throw new TRPCError({ code: "CONFLICT", message: "O fechamento deste turno já foi enviado ou finalizado; não são aceitas novas vendas." });

        const catalog = await tx.select().from(products).where(and(
          eq(products.unitId, ctx.user.unitId),
          eq(products.active, true),
          or(...itemIds.map(id => eq(products.id, id)))!
        )).for("share");
        if (catalog.length !== itemIds.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais produtos não estão ativos nesta unidade." });
        const [commissionSetting] = await tx.select({ value: unitSettings.settingValue }).from(unitSettings).where(and(
          eq(unitSettings.unitId, ctx.user.unitId),
          eq(unitSettings.settingKey, commissionSettingKey)
        )).limit(1);
        const commissionsEnabled = commissionSetting?.value === "true";
        const calculated = input.items.map(item => {
          const product = catalog.find(candidate => candidate.id === item.productId)!;
          return { item, product, values: calculateSaleLine(product, item.quantity, commissionsEnabled) };
        });
        const totals = sumSaleLines(calculated.map(line => line.values));
        const [sale] = await tx.insert(productSales).values({
          unitId: ctx.user.unitId,
          closureId: closure?.id ?? null,
          closureDate: input.closureDate,
          shift: input.shift,
          userId: ctx.user.id,
          employeeId: employee.id,
          sellerName: employee.fullName,
          idempotencyKey: input.idempotencyKey,
          totalCents: totals.totalCents,
          commissionCents: totals.commissionCents,
        }).returning({ id: productSales.id, totalCents: productSales.totalCents });
        await tx.insert(productSaleItems).values(calculated.map(({ item, product, values }) => ({
          saleId: sale.id,
          productId: product.id,
          barcodeSnapshot: product.barcode,
          nameSnapshot: product.name,
          brandSnapshot: product.brand,
          categorySnapshot: product.category,
          specificationSnapshot: product.specification,
          quantity: item.quantity,
          unitPriceCents: product.priceCents,
          totalCents: values.totalCents,
          commissionMode: values.commissionMode,
          commissionValue: values.commissionValue,
          commissionCents: values.commissionCents,
        })));
        if (closure) {
          const existingRows = await tx.select({ totalCents: productSales.totalCents }).from(productSales).where(and(
            eq(productSales.closureId, closure.id), isNull(productSales.canceledAt)
          ));
          const productSalesCents = existingRows.reduce((sum, row) => sum + row.totalCents, 0);
          const differenceCents = closure.receivedCents - closure.salesCents - productSalesCents;
          await tx.update(closures).set({
            productSalesCents,
            differenceCents,
            result: classify(differenceCents, closure.toleranceCents),
            revision: closure.revision + 1,
            updatedAt: new Date(),
          }).where(eq(closures.id, closure.id));
        }
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "productSale",
          targetId: sale.id,
          action: "product_sale_created",
          field: "totalCents",
          beforeValue: null,
          afterValue: String(sale.totalCents),
          reason: null,
        });
        return { ...sale, repeated: false };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [replayed] = await ctx.db.select({ id: productSales.id, totalCents: productSales.totalCents }).from(productSales).where(and(
          eq(productSales.unitId, ctx.user.unitId), eq(productSales.idempotencyKey, input.idempotencyKey)
        )).limit(1);
        if (replayed) return { ...replayed, repeated: true };
      }
      throw error;
    }
  }),

  cancel: managerProcedure.input(z.object({ id: positiveId, reason: z.string().trim().min(5).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.transaction(async tx => {
        const [sale] = await tx.select().from(productSales).where(and(
          eq(productSales.id, input.id), eq(productSales.unitId, ctx.user.unitId)
        )).limit(1).for("update");
        if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
        if (sale.canceledAt) throw new TRPCError({ code: "CONFLICT", message: "Esta venda já foi cancelada." });
        const now = new Date();
        await tx.update(productSales).set({ canceledAt: now, canceledBy: ctx.user.id, cancelReason: input.reason }).where(eq(productSales.id, sale.id));
        if (sale.closureId) {
          const [closure] = await tx.select().from(closures).where(eq(closures.id, sale.closureId)).limit(1).for("update");
          if (closure) {
            const otherSales = await tx.select({ totalCents: productSales.totalCents }).from(productSales).where(and(
              eq(productSales.closureId, closure.id), isNull(productSales.canceledAt)
            ));
            const productSalesCents = otherSales.reduce((sum, row) => sum + row.totalCents, 0);
            const differenceCents = closure.receivedCents - closure.salesCents - productSalesCents;
            await tx.update(closures).set({
              productSalesCents,
              differenceCents,
              result: classify(differenceCents, closure.toleranceCents),
              revision: closure.revision + 1,
              updatedAt: now,
            }).where(eq(closures.id, closure.id));
          }
        }
        await tx.insert(auditEvents).values({
          unitId: ctx.user.unitId,
          userId: ctx.user.id,
          targetType: "productSale",
          targetId: sale.id,
          action: "product_sale_canceled",
          field: "canceledAt",
          beforeValue: null,
          afterValue: now.toISOString(),
          reason: input.reason,
        });
      });
      return { success: true };
    }),

  report: managerProcedure.input(z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.from && input.to && input.from > input.to)
        throw new TRPCError({ code: "BAD_REQUEST", message: "A data inicial não pode ser posterior à final." });
      const conditions = [eq(productSales.unitId, ctx.user.unitId), isNull(productSales.canceledAt)];
      if (input?.from) conditions.push(gte(productSales.closureDate, input.from));
      if (input?.to) conditions.push(lte(productSales.closureDate, input.to));
      const rows = await ctx.db.select({
        sale: productSales,
        employeeName: employees.fullName,
        item: productSaleItems,
      }).from(productSales)
        .innerJoin(employees, eq(productSales.employeeId, employees.id))
        .innerJoin(productSaleItems, eq(productSaleItems.saleId, productSales.id))
        .where(and(...conditions))
        .orderBy(desc(productSales.closureDate), desc(productSales.id), asc(productSaleItems.id));
      const bySeller = new Map<number, { employeeId: number; sellerName: string; salesCents: number; commissionCents: number; quantity: number; count: number }>();
      for (const row of rows) {
        const summary = bySeller.get(row.sale.employeeId) ?? {
          employeeId: row.sale.employeeId,
          sellerName: row.sale.sellerName || row.employeeName,
          salesCents: 0,
          commissionCents: 0,
          quantity: 0,
          count: 0,
        };
        summary.salesCents += row.item.totalCents;
        summary.commissionCents += row.item.commissionCents;
        summary.quantity += row.item.quantity;
        summary.count += 1;
        bySeller.set(row.sale.employeeId, summary);
      }
      return {
        sellers: [...bySeller.values()].sort((a, b) => a.sellerName.localeCompare(b.sellerName, "pt-BR")),
        sales: rows.map(row => ({
          id: row.sale.id,
          date: row.sale.closureDate,
          shift: row.sale.shift,
          sellerName: row.sale.sellerName,
          totalCents: row.sale.totalCents,
          commissionCents: row.item.commissionCents,
          item: row.item,
        })),
      };
    }),
});
