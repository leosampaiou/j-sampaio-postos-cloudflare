// Smoke e2e contra o Worker de staging. Uso: node scripts/smoke-staging.mjs <BASE_URL>
// Lê usuário/senha de SMOKE_USER / SMOKE_PASS. Não grava segredos.
const base = process.argv[2];
const user = process.env.SMOKE_USER;
const pass = process.env.SMOKE_PASS;
if (!base || !user || !pass)
  throw new Error("Informe BASE_URL, SMOKE_USER e SMOKE_PASS");
import superjson from "superjson";

let cookie = "";
let csrf = "";
const results = [];

async function trpc(path, input, { mutation = false } = {}) {
  const payload = JSON.stringify({ 0: superjson.serialize(input) });
  const url = `${base}/api/trpc/${path}?batch=1${mutation ? "" : `&input=${encodeURIComponent(payload)}`}`;
  const res = await fetch(url, {
    method: mutation ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-csrf-token": csrf,
    },
    body: mutation ? payload : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const body = await res.json();
  const item = body[0];
  if (item.error) {
    const e = item.error.json;
    throw new Error(`${path}: ${e.data?.code} ${e.message}`);
  }
  return superjson.deserialize(item.result.data);
}
async function step(name, fn) {
  try {
    const out = await fn();
    results.push({ name, ok: true });
    console.log("OK  ", name);
    return out;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log("FAIL", name, "-", e.message);
  }
}

const login = await step("auth.login", () =>
  trpc("auth.login", { username: user, password: pass }, { mutation: true })
);
if (!login) process.exit(1);
csrf = login.csrfToken;
await step("auth.me", () => trpc("auth.me"));
await step("settings.get", () => trpc("settings.get"));
await step("employees.create", () =>
  trpc("employees.create", { fullName: "Frentista Teste" }, { mutation: true })
);
await step("employees.list", () => trpc("employees.list"));
const tank = await step("inventory.createTank", () =>
  trpc(
    "inventory.createTank",
    {
      name: "Tanque Gasolina Teste",
      code: `T-${Date.now()}`,
      fuelType: "gasolina_comum",
      capacityTotalLiters: 20000,
      operationalCapacityLiters: 19000,
      minimumStockLiters: 2000,
      initialStockLiters: 5000,
      stockStartDate: "2026-11-01",
      replenishmentLeadDays: 2,
      safetyReserveLiters: 500,
      nearMinimumPercent: 20,
      autonomyWarningDays: 5,
      autonomyCriticalDays: 2,
      discrepancyAlertPercent: 1,
      staleAfterDays: 7,
    },
    { mutation: true }
  )
);
const tanks = await step("inventory.listTanks", () =>
  trpc("inventory.listTanks")
);
const tankId = tank?.id ?? tanks?.[0]?.id;
const receipt = await step("inventory.createReceipt", () =>
  trpc(
    "inventory.createReceipt",
    {
      tankId,
      supplier: "Distribuidora Teste",
      invoiceNumber: `NF-${Date.now()}`,
      occurredAt: new Date().toISOString(),
      quantityLiters: 3000,
      acquisitionValueCents: 1_500_000,
      idempotencyKey: crypto.randomUUID(),
    },
    { mutation: true }
  )
);
if (receipt) {
  const target = await step("inventory.receiptUploadTarget", () =>
    trpc(
      "inventory.receiptUploadTarget",
      {
        movementId: receipt.id,
        fileName: "nf.pdf",
        contentType: "application/pdf",
        sizeBytes: 40,
      },
      { mutation: true }
    )
  );
  if (target) {
    const pdf = new TextEncoder().encode("%PDF-1.4\n% smoke test\n%%EOF\n");
    await step("R2 PUT /api/files", async () => {
      const r = await fetch(base + target.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          cookie,
          "x-csrf-token": csrf,
        },
        body: pdf,
      });
      if (r.status !== 201)
        throw new Error(`HTTP ${r.status} ${await r.text()}`);
    });
    await step("R2 PUT sem CSRF é recusado", async () => {
      const r = await fetch(base + target.uploadUrl + "x", {
        method: "PUT",
        headers: { "content-type": "application/pdf", cookie },
        body: pdf,
      });
      if (r.status === 201) throw new Error("aceitou sem CSRF");
    });
    await step("inventory.attachReceiptDocument", () =>
      trpc(
        "inventory.attachReceiptDocument",
        { movementId: receipt.id, documentKey: target.key },
        { mutation: true }
      )
    );
    await step("R2 GET /api/files", async () => {
      const r = await fetch(base + target.uploadUrl, { headers: { cookie } });
      const text = await r.text();
      if (r.status !== 200 || !text.startsWith("%PDF"))
        throw new Error(`HTTP ${r.status}`);
    });
    await step("R2 GET sem sessão é recusado", async () => {
      const r = await fetch(base + target.uploadUrl);
      if (r.status !== 401) throw new Error(`HTTP ${r.status}`);
    });
  }
}
await step("settings.update (preços)", () =>
  trpc(
    "settings.update",
    {
      gasolineCents: 600,
      dieselCents: 500,
      toleranceCents: 500,
      legalName: "J Sampaio Postos Teste LTDA",
      tradeName: "J Sampaio Postos",
      cnpj: "12345678000190",
      address: "Rua Teste, 100",
      city: "Salvador",
      state: "BA",
      postalCode: "40000000",
    },
    { mutation: true }
  )
);
const emp = (
  await step("employees.list (fechamento)", () => trpc("employees.list"))
)?.[0];
await step("inventory.assignPump", () =>
  trpc("inventory.assignPump", { pumpId: 1, tankId }, { mutation: true })
);
const saved =
  emp &&
  (await step("closures.saveDraft", () =>
    trpc(
      "closures.saveDraft",
      {
        closureDate: new Date(
          Date.now() - 86400000 * (1 + Math.floor(Math.random() * 25))
        )
          .toISOString()
          .slice(0, 10),
        shift: "manha",
        employeeId: emp.id,
        responsibleName: "Responsável Teste",
        notes: "",
        employeeConfirmed: true,
        responsibleConfirmed: true,
        nozzles: [1, 2, 3, 4].map(pumpId => ({
          pumpId,
          initialReading: "100.000",
          finalReading: pumpId === 1 ? "150.000" : "100.000",
        })),
        payments: [
          { method: "dinheiro", amountCents: 10000 },
          { method: "pix", amountCents: 20000 },
          { method: "debito", amountCents: 0 },
          { method: "credito", amountCents: 0 },
        ],
        participants: [{ employeeId: emp.id, sharePercent: 100 }],
      },
      { mutation: true }
    )
  ));
const closureId = saved?.id ?? saved?.closureId;
if (closureId) {
  await step("closures.finalize", () =>
    trpc("closures.finalize", { id: closureId }, { mutation: true })
  );
  await step("closures.detail", () =>
    trpc("closures.detail", { id: closureId })
  );
}
await step("closures.listPage", () => trpc("closures.listPage", {}));
await step("inventory.dashboard", () => trpc("inventory.dashboard", {}));
await step("inventory.movements", () => trpc("inventory.movements", {}));
await step("discrepancies.list", () => trpc("discrepancies.list", {}));
await step("analytics.dashboard", () =>
  trpc("analytics.dashboard", { from: "2026-11-01", to: "2026-11-30" })
);
await step("audit.list", () => trpc("audit.list"));
await step("users.list", () => trpc("users.list"));
await step("auth.logout", () =>
  trpc("auth.logout", undefined, { mutation: true })
);
await step("auth.me após logout é recusado", async () => {
  try {
    await trpc("auth.me");
  } catch {
    return;
  }
  throw new Error("sessão ainda válida");
});
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passos OK`);
process.exit(failed.length ? 1 : 0);
