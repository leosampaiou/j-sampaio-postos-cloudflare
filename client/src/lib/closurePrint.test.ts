import { describe, expect, it } from "vitest";
import { buildClosurePrintHtml, type ClosurePrintInput } from "./closurePrint";

const closure: ClosurePrintInput = {
  closureDate: "2026-11-20",
  shift: "manha",
  result: "sobra",
  employeeName: "Frentista Teste",
  responsibleName: "Responsável Teste",
  salesCents: 120000,
  receivedCents: 120500,
  differenceCents: 500,
  notes: "Observação <script>alert('x')</script>",
  employeeConfirmed: true,
  responsibleConfirmed: true,
  createdAt: "2026-11-20T12:00:00.000Z",
  finalizedAt: "2026-11-20T13:00:00.000Z",
  unit: {
    tradeName: "Posto Exemplo",
    legalName: "Empresa Exemplo Ltda.",
    cnpj: "00.000.000/0001-00",
    address: "Rua Exemplo, 10",
    city: "Vargem Grande",
    state: "MA",
    postalCode: "65430-000",
  },
  nozzles: [
    {
      pumpNumber: "Bico 01",
      fuelType: "gasolina_comum",
      initialReading: "100.000",
      finalReading: "110.000",
      liters: "10.000",
      priceCents: 6000,
      valueCents: 60000,
    },
    {
      pumpNumber: "Bico 02",
      fuelType: "gasolina_comum",
      initialReading: "200.000",
      finalReading: "205.000",
      liters: "5.000",
      priceCents: 6000,
      valueCents: 30000,
    },
    {
      pumpNumber: "Bico 03",
      fuelType: "gasolina_comum",
      initialReading: "300.000",
      finalReading: "303.000",
      liters: "3.000",
      priceCents: 6000,
      valueCents: 18000,
    },
    {
      pumpNumber: "Bico 04",
      fuelType: "diesel_s10",
      initialReading: "400.000",
      finalReading: "402.000",
      liters: "2.000",
      priceCents: 6000,
      valueCents: 12000,
    },
  ],
  payments: [
    { method: "dinheiro", amountCents: 30000 },
    { method: "pix", amountCents: 30500 },
    { method: "debito", amountCents: 30000 },
    { method: "credito", amountCents: 30000 },
  ],
};

describe("closure print document", () => {
  it("renders A4 and every persisted closure field without changing values", () => {
    const html = buildClosurePrintHtml(closure, "https://example.test");
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("Posto Exemplo");
    expect(html).toContain("2026-11-20");
    expect(html).toContain("Frentista Teste");
    expect(html).toContain("Responsável Teste");
    expect(html).toContain("GASOLINA COMUM");
    expect(html).toContain("DIESEL S10");
    expect(html).toContain("fuel-type-gasoline");
    expect(html).toContain("fuel-type-diesel");
    for (const pump of ["Bico 01", "Bico 02", "Bico 03", "Bico 04"])
      expect(html).toContain(pump);
    for (const method of ["Dinheiro", "PIX", "Débito", "Crédito"])
      expect(html).toContain(method);
    expect(html).toContain("Total de vendas");
    expect(html).toContain("Total recebido");
    expect(html).toContain("Diferença registrada");
    expect(html).toContain("Resultado: SOBRA");
    expect(html).toContain(
      "Observação &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"
    );
    expect(html).not.toContain("<script>alert('x')</script>");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("logo-jsampaio.png");
  });

  it("shows explicit notes and reading empty states instead of fabricating rows", () => {
    const html = buildClosurePrintHtml({
      ...closure,
      nozzles: [],
      payments: [],
      notes: "",
    });
    expect(html).toContain("Nenhuma leitura persistida neste fechamento.");
    expect(html).toContain("Nenhum recebimento persistido.");
    expect(html).toContain("Nenhuma observação registrada.");
  });
});
