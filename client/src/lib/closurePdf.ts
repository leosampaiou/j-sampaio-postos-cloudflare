import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fuelTypeLabel, fuelTypeOption } from "@shared/fuel";

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentNames: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
};
const shiftNames: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};
const statusNames: Record<string, string> = {
  conferido: "CONFERIDO",
  sobra: "SOBRA",
  falta: "FALTA",
  pendente: "PENDENTE",
};
const toDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar o logotipo.");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export async function createClosurePdf(closure: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const navy = [16, 46, 99] as [number, number, number];
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 39, "F");
  try {
    const logo = await toDataUrl("/logo-jsampaio.png");
    doc.addImage(logo, "PNG", 14, 4, 29, 29);
  } catch {
    /* nome da empresa permanece no cabeçalho */
  }
  const unit = closure.unit ?? {};
  const brandName = unit.tradeName || "J SAMPAIO POSTOS";
  const legalName = unit.legalName || "D ANDRADE SAMPAIO LTDA.";
  const companyAddress = [
    unit.address,
    [unit.city, unit.state].filter(Boolean).join("/"),
    unit.postalCode ? `CEP ${unit.postalCode}` : "",
  ]
    .filter(Boolean)
    .join("  •  ");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(brandName, 49, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${legalName}  •  CNPJ ${unit.cnpj || "—"}`, 49, 21);
  doc.text(companyAddress || "Vargem Grande/MA", 49, 27);
  doc.setFontSize(8);
  doc.text("CONTROLE DIÁRIO DE VENDAS", 49, 33);
  doc.setTextColor(23, 35, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Fechamento do turno", 14, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Data: ${new Date(`${closure.closureDate}T12:00:00`).toLocaleDateString("pt-BR")}     Turno: ${shiftNames[closure.shift] ?? closure.shift}`,
    14,
    57
  );
  doc.text(
    `Frentista: ${closure.employeeName}     Responsável: ${closure.responsibleName}`,
    14,
    64
  );
  autoTable(doc, {
    startY: 71,
    head: [
      [
        "Bico",
        "Combustível",
        "Leitura inicial",
        "Leitura final",
        "Litros",
        "Preço/L",
        "Valor vendido",
      ],
    ],
    body: (closure.nozzles ?? []).map((n: any) => [
      n.pumpNumber,
      fuelTypeLabel(n.fuelType),
      String(n.initialReading),
      String(n.finalReading),
      Number(n.liters).toLocaleString("pt-BR", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }),
      money(n.priceCents),
      money(n.valueCents),
    ]),
    theme: "grid",
    headStyles: { fillColor: navy, fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    styles: { overflow: "linebreak" },
    margin: { left: 14, right: 14 },
    didParseCell: data => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const fuelType = closure.nozzles?.[data.row.index]?.fuelType;
      const option = fuelType ? fuelTypeOption(fuelType) : undefined;
      if (!option) return;
      data.cell.styles.fontStyle = "bold";
      data.cell.styles.textColor =
        option.tone === "gasoline" ? [150, 70, 0] : [135, 35, 45];
      data.cell.styles.fillColor =
        option.tone === "gasoline" ? [255, 241, 221] : [252, 233, 235];
    },
  });
  let y = (doc as any).lastAutoTable.finalY + 8;
  const gas = (closure.nozzles ?? []).filter(
    (n: any) => n.fuelType === "gasolina_comum"
  );
  const diesel = (closure.nozzles ?? []).filter(
    (n: any) => n.fuelType === "diesel_s10"
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("RESUMO DE VENDAS", 14, y);
  y += 6;
  doc.setFontSize(8);
  const drawFuelSummary = (fuelType: string, rows: any[]) => {
    const option = fuelTypeOption(fuelType);
    const textColor =
      option?.tone === "gasoline" ? [150, 70, 0] : [135, 35, 45];
    const fillColor =
      option?.tone === "gasoline" ? [255, 241, 221] : [252, 233, 235];
    const label = fuelTypeLabel(fuelType);
    const labelWidth = doc.getTextWidth(label) + 4;
    doc.setFillColor(...(fillColor as [number, number, number]));
    doc.roundedRect(14, y - 3.3, labelWidth, 5, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(textColor as [number, number, number]));
    doc.text(label, 16, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35, 45, 60);
    const totalLiters = rows.reduce(
      (sum: number, row: any) => sum + Number(row.liters),
      0
    );
    const totalSales = rows.reduce(
      (sum: number, row: any) => sum + row.valueCents,
      0
    );
    doc.text(
      `${totalLiters.toLocaleString("pt-BR")} L  •  ${money(totalSales)}`,
      14 + labelWidth + 3,
      y
    );
    y += 5;
  };
  drawFuelSummary("gasolina_comum", gas);
  drawFuelSummary("diesel_s10", diesel);
  doc.setFont("helvetica", "bold");
  doc.text(
    `TOTAL: ${money(closure.salesCents)}  •  ${(closure.nozzles ?? []).reduce((s: number, n: any) => s + Number(n.liters), 0).toLocaleString("pt-BR")} litros`,
    14,
    y
  );
  y += 10;
  autoTable(doc, {
    startY: y,
    head: [["Recebimento", "Valor"]],
    body: (closure.payments ?? []).map((p: any) => [
      paymentNames[p.method] ?? p.method,
      money(p.amountCents),
    ]),
    theme: "grid",
    headStyles: { fillColor: navy, fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 14, right: 112 },
    tableWidth: 84,
  });
  y = (doc as any).lastAutoTable.finalY + 8;
  const result = statusNames[closure.result] ?? closure.result.toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`TOTAL RECEBIDO: ${money(closure.receivedCents)}`, 108, y);
  y += 7;
  doc.text(
    `DIFERENÇA: ${money(closure.differenceCents)}   •   ${result}`,
    108,
    y
  );
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Observações e ocorrências:", 14, y);
  y += 4;
  const notes = doc.splitTextToSize(
    closure.notes || "Nenhuma observação registrada.",
    180
  );
  doc.text(notes, 14, y);
  y += Math.max(8, notes.length * 4 + 4);
  if (y > 272) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(200, 207, 218);
  doc.line(14, y, 196, y);
  y += 7;
  doc.setFontSize(7);
  doc.text(
    `Responsabilidade do frentista: ${closure.employeeConfirmed ? "confirmada" : "não confirmada"}`,
    14,
    y
  );
  doc.text(
    `Responsável pelo fechamento: ${closure.responsibleConfirmed ? "confirmada" : "não confirmada"}`,
    110,
    y
  );
  y += 6;
  doc.text(
    `Registrado em: ${new Date(closure.createdAt).toLocaleString("pt-BR")}${closure.finalizedAt ? `  •  Finalizado em: ${new Date(closure.finalizedAt).toLocaleString("pt-BR")}` : ""}`,
    14,
    y
  );
  doc.setTextColor(...navy);
  doc.setFontSize(7);
  doc.text(
    "Documento gerado pelo Sistema de Gestão de Fechamentos — J Sampaio Postos",
    105,
    290,
    { align: "center" }
  );
  const day = closure.closureDate.replaceAll("-", "");
  const shift = (shiftNames[closure.shift] ?? closure.shift)
    .toUpperCase()
    .replace("Ã", "A");
  return {
    doc,
    filename: `Fechamento_J_Sampaio_Postos_${day}_${shift}.pdf`,
    message: `Olá! Segue o fechamento do ${brandName}.\n\nData: ${new Date(`${closure.closureDate}T12:00:00`).toLocaleDateString("pt-BR")}\nTurno: ${shiftNames[closure.shift]}\nFrentista: ${closure.employeeName}\n\nTotal de vendas: ${money(closure.salesCents)}\nTotal recebido: ${money(closure.receivedCents)}\nDiferença: ${money(closure.differenceCents)}\nResultado: ${result}\n\nSegue em anexo o relatório completo do fechamento.`,
  };
}

export async function shareClosurePdf(closure: any) {
  const { doc, filename, message } = await createClosurePdf(closure);
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({ files: [file], title: filename, text: message });
    return "shared" as const;
  }
  doc.save(filename);
  window.open(
    `https://wa.me/?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
  return "downloaded" as const;
}
