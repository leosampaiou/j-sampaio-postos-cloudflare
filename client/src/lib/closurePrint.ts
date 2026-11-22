export type ClosurePrintInput = {
  closureDate: string;
  shift: string;
  result: string;
  employeeName: string;
  responsibleName: string;
  salesCents: number;
  receivedCents: number;
  differenceCents: number;
  notes?: string | null;
  employeeConfirmed?: boolean;
  responsibleConfirmed?: boolean;
  createdAt?: string | Date | null;
  finalizedAt?: string | Date | null;
  unit?: {
    legalName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
  nozzles?: Array<{
    pumpNumber: string | number;
    fuelType: string;
    initialReading: string | number;
    finalReading: string | number;
    liters: string | number;
    priceCents: number;
    valueCents: number;
  }>;
  payments?: Array<{ method: string; amountCents: number }>;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (cents: unknown) =>
  (asNumber(cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const liters = (value: unknown) =>
  `${asNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} L`;

const dateLabel = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const dateTimeLabel = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";
const fuelLabel = (value: string) =>
  (
    ({ gasolina_comum: "Gasolina Comum", diesel_s10: "Diesel S10" }) as Record<
      string,
      string
    >
  )[value] ?? value;
const paymentLabel = (value: string) =>
  (
    ({
      dinheiro: "Dinheiro",
      pix: "PIX",
      debito: "Débito",
      credito: "Crédito",
    }) as Record<string, string>
  )[value] ?? value;
const shiftLabel = (value: string) =>
  (
    ({ manha: "Manhã", tarde: "Tarde", noite: "Noite" }) as Record<
      string,
      string
    >
  )[value] ?? value;
const resultLabel = (value: string) =>
  (
    ({
      conferido: "CONFERIDO",
      sobra: "SOBRA",
      falta: "FALTA",
      pendente: "PENDENTE",
    }) as Record<string, string>
  )[value] ?? value.toUpperCase();

export function buildClosurePrintHtml(closure: ClosurePrintInput, origin = "") {
  const unit = closure.unit ?? {};
  const nozzles = closure.nozzles ?? [];
  const payments = closure.payments ?? [];
  const brandName = unit.tradeName || "J SAMPAIO POSTOS";
  const address = [
    unit.address,
    [unit.city, unit.state].filter(Boolean).join("/"),
    unit.postalCode ? `CEP ${unit.postalCode}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const fuelTotals = new Map<string, { liters: number; valueCents: number }>();
  for (const nozzle of nozzles) {
    const current = fuelTotals.get(nozzle.fuelType) ?? {
      liters: 0,
      valueCents: 0,
    };
    current.liters += asNumber(nozzle.liters);
    current.valueCents += asNumber(nozzle.valueCents);
    fuelTotals.set(nozzle.fuelType, current);
  }
  const logoUrl = origin
    ? `${origin.replace(/\/$/, "")}/logo-jsampaio.png`
    : "/logo-jsampaio.png";
  const nozzleRows = nozzles
    .map(
      nozzle => `
    <tr>
      <td>${escapeHtml(nozzle.pumpNumber)}</td>
      <td>${escapeHtml(fuelLabel(nozzle.fuelType))}</td>
      <td class="numeric">${escapeHtml(nozzle.initialReading)}</td>
      <td class="numeric">${escapeHtml(nozzle.finalReading)}</td>
      <td class="numeric">${escapeHtml(liters(nozzle.liters))}</td>
      <td class="numeric">${escapeHtml(money(nozzle.priceCents))}</td>
      <td class="numeric">${escapeHtml(money(nozzle.valueCents))}</td>
    </tr>`
    )
    .join("");
  const paymentRows = payments
    .map(
      payment => `
    <tr><td>${escapeHtml(paymentLabel(payment.method))}</td><td class="numeric">${escapeHtml(money(payment.amountCents))}</td></tr>`
    )
    .join("");
  const fuelRows = [...fuelTotals]
    .map(
      ([fuel, total]) => `
    <tr><td>${escapeHtml(fuelLabel(fuel))}</td><td class="numeric">${escapeHtml(liters(total.liters))}</td><td class="numeric">${escapeHtml(money(total.valueCents))}</td></tr>`
    )
    .join("");
  const result = resultLabel(closure.result);
  const resultTone =
    closure.result === "sobra"
      ? "positive"
      : closure.result === "falta"
        ? "negative"
        : "neutral";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(origin ? `${origin.replace(/\/$/, "")}/` : "/")}">
  <title>Fechamento ${escapeHtml(closure.closureDate)} — ${escapeHtml(shiftLabel(closure.shift))}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0 auto; max-width: 190mm; color: #202a3a; font: 10pt/1.4 Arial, Helvetica, sans-serif; }
    header { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; border-bottom: 3px solid #edb51f; }
    header img { width: 28mm; height: 22mm; object-fit: contain; }
    header h1 { margin: 0 0 3px; color: #102e63; font-size: 18pt; }
    header p { margin: 2px 0; font-size: 8.5pt; }
    h2 { margin: 16px 0 7px; padding-bottom: 4px; border-bottom: 1px solid #d9e0ea; color: #102e63; font-size: 11pt; }
    .identity { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; margin: 12px 0; }
    .identity div { min-width: 0; }
    .label { color: #667286; font-size: 8pt; }
    .value { display: block; font-weight: 700; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-size: 8.3pt; }
    thead { display: table-header-group; }
    th { background: #102e63; color: #fff; text-align: left; }
    th, td { padding: 6px 5px; border: 1px solid #d9e0ea; vertical-align: top; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .numeric { text-align: right; white-space: nowrap; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
    .total-box { margin-top: 9px; padding: 10px 12px; border: 1px solid #d9e0ea; border-radius: 5px; }
    .total-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
    .total-row strong { text-align: right; }
    .result { margin-top: 8px; font-size: 12pt; font-weight: 700; }
    .positive { color: #20875b; }
    .negative { color: #c93f47; }
    .neutral { color: #526075; }
    .notes { white-space: pre-wrap; overflow-wrap: anywhere; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0 8px; }
    .signature { border-top: 1px solid #778294; padding-top: 5px; font-size: 8pt; }
    footer { margin-top: 18px; padding-top: 7px; border-top: 1px solid #d9e0ea; color: #667286; text-align: center; font-size: 7.5pt; }
    @media screen { body { padding: 18px; } }
    @media print { body { max-width: none; } header, .total-box, table, .signatures { break-inside: avoid; } h2 { break-after: avoid; } }
    @media screen and (max-width: 600px) { body { padding: 14px; font-size: 9pt; } header img { width: 23mm; } .identity, .summary-grid, .signatures { grid-template-columns: 1fr; } .table-wrap { overflow-x: auto; } }
  </style>
</head>
<body>
  <header>
    <img src="${escapeHtml(logoUrl)}" alt="Logotipo ${escapeHtml(brandName)}" onerror="this.hidden=true">
    <div><h1>${escapeHtml(brandName)}</h1>${unit.legalName ? `<p><strong>${escapeHtml(unit.legalName)}</strong></p>` : ""}${unit.cnpj ? `<p>CNPJ ${escapeHtml(unit.cnpj)}</p>` : ""}${address ? `<p>${escapeHtml(address)}</p>` : ""}</div>
  </header>
  <h2>Fechamento do turno</h2>
  <section class="identity">
    <div><span class="label">Data</span><span class="value">${escapeHtml(dateLabel(closure.closureDate))}</span></div>
    <div><span class="label">Turno</span><span class="value">${escapeHtml(shiftLabel(closure.shift))}</span></div>
    <div><span class="label">Frentista</span><span class="value">${escapeHtml(closure.employeeName)}</span></div>
    <div><span class="label">Responsável pelo fechamento</span><span class="value">${escapeHtml(closure.responsibleName)}</span></div>
  </section>
  <h2>Leituras e vendas por bico</h2>
  <div class="table-wrap"><table><thead><tr><th>Bico</th><th>Combustível</th><th>Leitura inicial</th><th>Leitura final</th><th>Litros</th><th>Preço/L</th><th>Valor</th></tr></thead><tbody>${nozzleRows || '<tr><td colspan="7">Nenhuma leitura persistida neste fechamento.</td></tr>'}</tbody></table></div>
  <div class="summary-grid">
    <section><h2>Resumo por combustível</h2><table><thead><tr><th>Combustível</th><th class="numeric">Litros</th><th class="numeric">Vendas</th></tr></thead><tbody>${fuelRows || '<tr><td colspan="3">Sem leituras de bicos neste registro.</td></tr>'}</tbody></table><div class="total-box"><div class="total-row"><span>Total de vendas</span><strong>${escapeHtml(money(closure.salesCents))}</strong></div><div class="total-row"><span>Litros totais registrados</span><strong>${escapeHtml(liters(nozzles.reduce((sum, nozzle) => sum + asNumber(nozzle.liters), 0)))}</strong></div></div></section>
    <section><h2>Recebimentos por modalidade</h2><table><thead><tr><th>Modalidade</th><th class="numeric">Valor</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="2">Nenhum recebimento persistido.</td></tr>'}</tbody></table><div class="total-box"><div class="total-row"><span>Total recebido</span><strong>${escapeHtml(money(closure.receivedCents))}</strong></div><div class="total-row"><span>Diferença registrada</span><strong>${escapeHtml(money(closure.differenceCents))}</strong></div><div class="result ${resultTone}">Resultado: ${escapeHtml(result)}</div></div></section>
  </div>
  <h2>Observações e ocorrências</h2>
  <p class="notes">${escapeHtml(closure.notes || "Nenhuma observação registrada.")}</p>
  <section class="signatures">
    <div class="signature">Frentista: ${closure.employeeConfirmed ? "responsabilidade confirmada" : "confirmação não registrada"}</div>
    <div class="signature">Responsável: ${closure.responsibleConfirmed ? "responsabilidade confirmada" : "confirmação não registrada"}</div>
  </section>
  <p class="label">Registrado em: ${escapeHtml(dateTimeLabel(closure.createdAt))} · Finalizado em: ${escapeHtml(dateTimeLabel(closure.finalizedAt))}</p>
  <footer>Documento gerado a partir dos dados persistidos — ${escapeHtml(brandName)} · J Sampaio Postos</footer>
</body>
</html>`;
}

export function openClosurePrintWindow(closure: ClosurePrintInput) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;
  const printDocument = printWindow.document;
  printDocument.open();
  printDocument.write(buildClosurePrintHtml(closure, window.location.origin));
  printDocument.close();
  const printWhenReady = async () => {
    const images = Array.from(printDocument.images).map(image =>
      image.decode?.().catch(() => undefined)
    );
    await Promise.all([printDocument.fonts?.ready, ...images]);
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 100);
  };
  window.setTimeout(() => void printWhenReady(), 0);
  return true;
}
