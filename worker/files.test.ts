import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("../server/_core/appAuth", async () => {
  const actual = await vi.importActual<
    typeof import("../server/_core/appAuth")
  >("../server/_core/appAuth");
  return { ...actual, authenticateRequest: vi.fn(async () => auth.result) };
});

import { handleFileRequest, type R2BucketLike } from "./files";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const KEY = `fuel-receipts/1/7/${UUID}.pdf`;
const URL_BASE = "https://app.test/api/files/";
const PDF = new TextEncoder().encode("%PDF-1.7 conteudo");

function fakeDb(ownerFound: boolean) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => (ownerFound ? [{ id: 7 }] : []),
  };
  return { select: () => chain } as never;
}
function fakeBucket(existing = false) {
  const stored = new Map<string, ArrayBuffer>();
  const bucket: R2BucketLike = {
    head: async () => (existing ? {} : null),
    get: async key =>
      stored.has(key)
        ? {
            body: new Response(stored.get(key)).body as ReadableStream,
            httpMetadata: { contentType: "application/pdf" },
          }
        : null,
    put: vi.fn(async (key: string, value: ArrayBuffer) => {
      stored.set(key, value);
    }),
  };
  return { bucket, stored };
}
function login(role = "gerente", unitId = 1) {
  auth.result = {
    user: { id: 3, role, unitId },
    session: { csrfToken: "csrf-ok" },
  };
}
function put(
  key = KEY,
  init: { csrf?: string; type?: string; body?: Uint8Array } = {}
) {
  const body = init.body ?? PDF;
  return new Request(URL_BASE + key, {
    method: "PUT",
    headers: {
      "x-csrf-token": init.csrf ?? "csrf-ok",
      "content-type": init.type ?? "application/pdf",
      "content-length": String(body.byteLength),
    },
    body,
  });
}

describe("handleFileRequest", () => {
  beforeEach(() => {
    auth.result = null;
  });

  it("exige sessão", async () => {
    const { bucket } = fakeBucket();
    const response = await handleFileRequest(put(), fakeDb(true), bucket);
    expect(response.status).toBe(401);
  });

  it("recusa frentista", async () => {
    login("frentista");
    const { bucket } = fakeBucket();
    expect((await handleFileRequest(put(), fakeDb(true), bucket)).status).toBe(
      403
    );
  });

  it("recusa PUT sem token CSRF válido", async () => {
    login();
    const { bucket } = fakeBucket();
    const response = await handleFileRequest(
      put(KEY, { csrf: "errado" }),
      fakeDb(true),
      bucket
    );
    expect(response.status).toBe(403);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("grava, e depois devolve, um PDF válido da própria unidade", async () => {
    login();
    const { bucket } = fakeBucket();
    const created = await handleFileRequest(put(), fakeDb(true), bucket);
    expect(created.status).toBe(201);
    const read = await handleFileRequest(
      new Request(URL_BASE + KEY),
      fakeDb(true),
      bucket
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    expect(read.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PDF);
  });

  it("recusa chave de outra unidade, chave malformada e path traversal", async () => {
    login("gerente", 2);
    const { bucket } = fakeBucket();
    expect((await handleFileRequest(put(), fakeDb(true), bucket)).status).toBe(
      404
    );
    login();
    for (const bad of [
      `fuel-receipts/1/7/${UUID}.exe`,
      `fuel-receipts/1/../7/${UUID}.pdf`,
      "../secret.pdf",
    ]) {
      expect(
        (await handleFileRequest(put(bad), fakeDb(true), bucket)).status
      ).toBe(400);
    }
  });

  it("recusa conteúdo que não bate com a extensão, tipo errado e vínculo inexistente", async () => {
    login();
    const { bucket } = fakeBucket();
    const fake = new TextEncoder().encode("<html>nao sou pdf</html>");
    expect(
      (await handleFileRequest(put(KEY, { body: fake }), fakeDb(true), bucket))
        .status
    ).toBe(415);
    expect(
      (
        await handleFileRequest(
          put(KEY, { type: "image/png" }),
          fakeDb(true),
          bucket
        )
      ).status
    ).toBe(415);
    expect((await handleFileRequest(put(), fakeDb(false), bucket)).status).toBe(
      404
    );
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("não sobrescreve objeto existente e limita o tamanho", async () => {
    login();
    const { bucket } = fakeBucket(true);
    expect((await handleFileRequest(put(), fakeDb(true), bucket)).status).toBe(
      409
    );
    const huge = new Request(URL_BASE + KEY, {
      method: "PUT",
      headers: {
        "x-csrf-token": "csrf-ok",
        "content-type": "application/pdf",
        "content-length": String(10_485_761),
      },
      body: PDF,
    });
    expect(
      (await handleFileRequest(huge, fakeDb(true), fakeBucket().bucket)).status
    ).toBe(413);
  });
});
