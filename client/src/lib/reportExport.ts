export async function exportReportXlsx(rows: any[]) {
  const XLSX = await import("xlsx");
  const data = rows.map(row => ({
    Data: new Date(`${row.closureDate}T12:00:00`).toLocaleDateString("pt-BR"),
    Turno:
      (
        { manha: "Manhã", tarde: "Tarde", noite: "Noite" } as Record<
          string,
          string
        >
      )[row.shift] ?? row.shift,
    Frentista: row.employeeName,
    Responsável: row.responsibleName,
    "Vendas de combustível (R$)": row.salesCents / 100,
    "Vendas de produtos (R$)": (row.productSalesCents ?? 0) / 100,
    "Total esperado (R$)":
      (row.salesCents + (row.productSalesCents ?? 0)) / 100,
    "Total recebido (R$)": row.receivedCents / 100,
    "Diferença (R$)": row.differenceCents / 100,
    Situação:
      (
        {
          conferido: "CONFERIDO",
          sobra: "SOBRA",
          falta: "FALTA",
          pendente: "PENDENTE",
        } as Record<string, string>
      )[row.result] ?? row.result,
    Status: row.status,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fechamentos");
  XLSX.writeFile(
    wb,
    `Relatorio_JSAMPAIO_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
