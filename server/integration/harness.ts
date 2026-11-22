/**
 * Harness de integração PostgreSQL para os routers tRPC.
 *
 * Uso:
 *   const h = await createIntegrationHarness();
 *   const admin = await h.bootstrapAdmin();
 *   const caller = await h.as(admin);
 *   await caller.settings.get();
 *
 * O harness usa exclusivamente PG_TEST_URL. A cada reset ele aplica a migration
 * PostgreSQL quando o schema ainda não existe ou faz TRUNCATE ... RESTART IDENTITY
 * CASCADE quando o schema já foi criado. Os callers são sempre construídos a
 * partir de createContext, com Request, Headers, cookie/Bearer e CSRF reais.
 * Use bootstrapAdmin() uma vez e login() para obter atores autenticados; createUser
 * e createEmployee ajudam a montar frentistas/gerentes para outros testes.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { parse as parseCookie } from "cookie";
import type { AppUser } from "../../drizzle/schema.pg";
import { appRouter } from "../routers";
import {
  createContext,
  type RuntimeBindings,
  type TrpcContext,
} from "../_core/context";
import { APP_SESSION_COOKIE } from "../_core/appAuth";
import { getPostgresDb, type PostgresDatabase } from "../db.pg";

export const TEST_INITIAL_ADMIN_SETUP_KEY =
  "integration-only-initial-admin-setup-key";
const TABLES = [
  "appSessions",
  "auditEvents",
  "closureNozzles",
  "closureParticipants",
  "closurePayments",
  "closures",
  "discrepancyAllocations",
  "discrepancyCases",
  "employees",
  "fuelPrices",
  "fuelPumps",
  "fuelTanks",
  "payrollAdjustmentReviews",
  "stockMovements",
  "tankMeasurements",
  "tankPumpAssignments",
  "unitSettings",
  "appUsers",
  "units",
] as const;

export type IntegrationActor = {
  user: AppUser;
  username: string;
  password: string;
  token: string;
  cookie: string;
  csrfToken: string;
  role: AppUser["role"];
};

export type IntegrationCaller = ReturnType<typeof appRouter.createCaller>;

export type CallerOptions = {
  csrfToken?: string;
  cookie?: string;
  bearer?: boolean;
  headers?: HeadersInit;
};

export type IntegrationRequest = {
  caller: IntegrationCaller;
  context: TrpcContext;
  responseHeaders: Headers;
};

function getTestUrl(connectionString = process.env.PG_TEST_URL) {
  if (!connectionString)
    throw new Error(
      "Os testes de integração exigem PG_TEST_URL apontando para o PostgreSQL de teste."
    );
  return connectionString;
}

async function applyMigration(client: ReturnType<typeof postgres>) {
  const migration = readFileSync(
    new URL("../../drizzle/pg-migrations/0000_initial_postgres.sql", import.meta.url),
    "utf8"
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await client.unsafe(trimmed);
  }
}

/** Limpa apenas o banco indicado por PG_TEST_URL; nunca usa DATABASE_URL. */
export async function resetIntegrationDatabase(
  connectionString = getTestUrl()
) {
  const client = postgres(connectionString, { max: 1, connect_timeout: 10 });
  try {
    const [{ exists }] = await client.unsafe<{ exists: string | null }[]>(
      `select to_regclass('public.units') as exists`
    );
    if (!exists) {
      await applyMigration(client);
    } else {
      const tables = TABLES.map(table => `"${table}"`).join(", ");
      await client.unsafe(
        `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`
      );
    }
  } finally {
    await client.end();
  }
}

function actorFromResponse(
  user: AppUser,
  username: string,
  password: string,
  csrfToken: string,
  responseHeaders: Headers
): IntegrationActor {
  const setCookie = responseHeaders.get("set-cookie") ?? "";
  const token = parseCookie(setCookie)[APP_SESSION_COOKIE];
  if (!token)
    throw new Error("O router não devolveu o cookie de sessão no bootstrap/login.");
  return {
    user,
    username,
    password,
    token,
    cookie: `${APP_SESSION_COOKIE}=${token}`,
    csrfToken,
    role: user.role,
  };
}

export class IntegrationHarness {
  readonly connectionString: string;
  readonly db: PostgresDatabase;
  readonly env: RuntimeBindings;

  constructor(
    connectionString = getTestUrl(),
    setupKey = TEST_INITIAL_ADMIN_SETUP_KEY
  ) {
    this.connectionString = connectionString;
    this.db = getPostgresDb({ connectionString });
    this.env = {
      PG_DATABASE_URL: connectionString,
      INITIAL_ADMIN_SETUP_KEY: setupKey,
    };
  }

  async reset() {
    await resetIntegrationDatabase(this.connectionString);
  }

  async request(
    actor?: IntegrationActor,
    options: CallerOptions = {}
  ): Promise<IntegrationRequest> {
    const headers = new Headers(options.headers);
    if (actor && options.bearer) {
      headers.set("authorization", `Bearer ${actor.token}`);
    } else if (actor) {
      headers.set("cookie", options.cookie ?? actor.cookie);
    } else if (options.cookie) {
      headers.set("cookie", options.cookie);
    }
    const csrf = options.csrfToken ?? actor?.csrfToken;
    if (csrf !== undefined) headers.set("x-csrf-token", csrf);
    const responseHeaders = new Headers();
    const req = new Request("http://integration.test/trpc", {
      method: "POST",
      headers,
    });
    const context = await createContext({ req, resHeaders: responseHeaders }, this.env);
    return {
      caller: appRouter.createCaller(context),
      context,
      responseHeaders,
    };
  }

  async as(actor: IntegrationActor, options?: CallerOptions) {
    return (await this.request(actor, options)).caller;
  }

  async anonymous() {
    return (await this.request()).caller;
  }

  async bootstrapAdmin(input?: {
    username?: string;
    fullName?: string;
    password?: string;
    activationKey?: string;
  }) {
    const username = input?.username ?? "admin.integration";
    const password = input?.password ?? "Admin integration password 123!";
    const request = await this.request();
    const result = await request.caller.auth.bootstrap({
      activationKey: input?.activationKey ?? TEST_INITIAL_ADMIN_SETUP_KEY,
      username,
      fullName: input?.fullName ?? "Administrador de Integração",
      password,
    });
    return actorFromResponse(
      result.user as AppUser,
      username,
      password,
      result.csrfToken,
      request.responseHeaders
    );
  }

  async login(username: string, password: string) {
    const request = await this.request();
    const result = await request.caller.auth.login({ username, password });
    return actorFromResponse(
      result.user as AppUser,
      username,
      password,
      result.csrfToken,
      request.responseHeaders
    );
  }

  async createEmployee(admin: IntegrationActor, fullName: string) {
    const result = await (await this.as(admin)).employees.create({ fullName });
    return result.id;
  }

  async createUser(
    admin: IntegrationActor,
    input: {
      username: string;
      fullName: string;
      password: string;
      role: AppUser["role"];
      employeeId?: number;
    }
  ) {
    await (await this.as(admin)).users.create(input);
    return this.login(input.username, input.password);
  }
}

export async function createIntegrationHarness(options?: {
  reset?: boolean;
  connectionString?: string;
  setupKey?: string;
}) {
  const connectionString = getTestUrl(options?.connectionString);
  const harness = new IntegrationHarness(
    connectionString,
    options?.setupKey ?? TEST_INITIAL_ADMIN_SETUP_KEY
  );
  if (options?.reset !== false) await harness.reset();
  return harness;
}

export const integrationEnabled = Boolean(process.env.PG_TEST_URL);
