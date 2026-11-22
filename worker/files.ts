import { and, eq } from "drizzle-orm";
import { discrepancyCases, stockMovements } from "../drizzle/schema.pg";
import type { PostgresDatabase } from "../server/db.pg";
import {
  authenticateRequest,
  constantTimeEqual,
} from "../server/_core/appAuth";

export const FILE_ROUTE_PREFIX = "/api/files/";
export const MAX_FILE_BYTES = 10_485_760;

/** Subconjunto do binding R2 usado pelo Worker (evita depender de tipos globais). */
export interface R2ObjectBodyLike {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
export interface R2BucketLike {
  head(key: string): Promise<unknown | null>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
}

const KEY_PATTERN =
  /^(fuel-receipts|fuel-discrepancy-evidence)\/(\d+)\/(\d+)\/[0-9a-f-]{36}\.(pdf|png|jpg)$/;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
};

const baseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...baseHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function matchesSignature(extension: string, bytes: Uint8Array): boolean {
  if (extension === "pdf")
    return (
      bytes.length > 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    );
  if (extension === "png")
    return (
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  return (
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

async function ownerExists(
  db: PostgresDatabase,
  folder: string,
  unitId: number,
  ownerId: number
): Promise<boolean> {
  if (folder === "fuel-receipts") {
    const [row] = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.id, ownerId),
          eq(stockMovements.unitId, unitId),
          eq(stockMovements.movementType, "receipt")
        )
      )
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: discrepancyCases.id })
    .from(discrepancyCases)
    .where(
      and(eq(discrepancyCases.id, ownerId), eq(discrepancyCases.unitId, unitId))
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Upload (PUT) e download (GET) autenticados de comprovantes/evidências no R2.
 * O bucket é privado: todo acesso passa pela sessão, papel, unidade e vínculo
 * com o registro. Chaves usam UUID e nunca sobrescrevem objetos existentes.
 */
export async function handleFileRequest(
  request: Request,
  db: PostgresDatabase,
  bucket: R2BucketLike | undefined
): Promise<Response> {
  if (request.method !== "PUT" && request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  if (!bucket)
    return json(
      { error: "O armazenamento seguro de arquivos não está disponível." },
      503
    );

  const authenticated = await authenticateRequest(request, db);
  if (!authenticated) return json({ error: "Faça login para continuar." }, 401);
  const { user, session } = authenticated;
  if (user.role !== "gerente" && user.role !== "administrador")
    return json(
      { error: "Seu perfil não tem permissão para esta operação." },
      403
    );

  let key: string;
  try {
    key = decodeURIComponent(
      new URL(request.url).pathname.slice(FILE_ROUTE_PREFIX.length)
    );
  } catch {
    return json({ error: "Arquivo inválido." }, 400);
  }
  const match = KEY_PATTERN.exec(key);
  if (!match) return json({ error: "Arquivo inválido." }, 400);
  const [, folder, unitText, ownerText, extension] = match;
  if (Number(unitText) !== user.unitId)
    return json({ error: "Arquivo não encontrado." }, 404);

  if (request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return json({ error: "Arquivo não encontrado." }, 404);
    return new Response(object.body, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type":
          object.httpMetadata?.contentType ??
          CONTENT_TYPE_BY_EXTENSION[extension],
        "Content-Disposition": "inline",
      },
    });
  }

  const providedCsrf = request.headers.get("x-csrf-token") ?? "";
  if (!constantTimeEqual(providedCsrf, session.csrfToken))
    return json(
      {
        error:
          "Validação de segurança inválida. Atualize a página e tente novamente.",
      },
      403
    );

  const expectedType = CONTENT_TYPE_BY_EXTENSION[extension];
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== expectedType)
    return json(
      { error: "Tipo de arquivo não permitido para esta chave." },
      415
    );

  const declared = Number(request.headers.get("content-length") ?? "");
  if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_FILE_BYTES)
    return json({ error: "O arquivo deve ter até 10 MB." }, 413);

  if (!(await ownerExists(db, folder, user.unitId, Number(ownerText))))
    return json({ error: "Registro vinculado não encontrado." }, 404);
  if (await bucket.head(key))
    return json({ error: "Este arquivo já foi enviado." }, 409);

  const content = await request.arrayBuffer();
  if (content.byteLength === 0 || content.byteLength > MAX_FILE_BYTES)
    return json({ error: "O arquivo deve ter até 10 MB." }, 413);
  if (!matchesSignature(extension, new Uint8Array(content, 0, 16)))
    return json(
      { error: "O conteúdo não corresponde ao tipo informado." },
      415
    );

  await bucket.put(key, content, {
    httpMetadata: { contentType: expectedType },
    customMetadata: {
      uploadedBy: String(user.id),
      unitId: String(user.unitId),
    },
  });
  return json({ success: true, key }, 201);
}
