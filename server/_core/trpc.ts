import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { constantTimeEqual } from "./appAuth";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Nunca expor stack traces ao cliente.
  errorFormatter({ shape }) {
    const { stack: _stack, ...data } = shape.data as typeof shape.data & {
      stack?: string;
    };
    return { ...shape, data };
  },
});
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.session)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Faça login para continuar.",
    });
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});
const requireCsrf = t.middleware(({ ctx, type, next }) => {
  if (type === "mutation" && ctx.session) {
    const provided = ctx.req.headers.get("x-csrf-token") ?? "";
    if (!constantTimeEqual(provided, ctx.session.csrfToken))
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Validação de segurança inválida. Atualize a página e tente novamente.",
      });
  }
  return next();
});
export const protectedProcedure = t.procedure.use(requireUser).use(requireCsrf);
const roleProcedure = (
  allowed: Array<"frentista" | "gerente" | "administrador">
) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!allowed.includes(ctx.user.role))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seu perfil não tem permissão para esta operação.",
      });
    return next();
  });
export const managerProcedure = roleProcedure(["gerente", "administrador"]);
export const adminProcedure = roleProcedure(["administrador"]);
