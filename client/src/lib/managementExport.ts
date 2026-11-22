import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportColumn = { header: string; key: string; width?: number };

export async function exportManagementXlsx(
  title: string,
  rows: Record<string, string | number | null | undefined>[],
  fileName: string
) {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const keys = rows.length ? Object.keys(rows[0]) : [];
  worksheet["!cols"] = keys.map(key => ({
    wch: Math.min(36, Math.max(14, key.length + 4)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, title.slice(0, 31));
  XLSX.writeFile(workbook, fileName);
}

export function exportManagementPdf(
  title: string,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown>>,
  fileName: string
) {
  const doc = new jsPDF({
    orientation: columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  doc.setFillColor(16, 46, 99);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("J SAMPAIO POSTOS", 14, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(title, 14, 19);
  doc.setTextColor(30, 42, 59);
  autoTable(doc, {
    startY: 31,
    head: [columns.map(column => column.header)],
    body: rows.map(row =>
      columns.map(column => String(row[column.key] ?? "—"))
    ),
    theme: "grid",
    headStyles: { fillColor: [24, 59, 120], fontSize: 8 },
    bodyStyles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    styles: { valign: "middle" },
    margin: { left: 12, right: 12 },
  });
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 130, 145);
    doc.text(
      `Relatório gerado em ${new Date().toLocaleString("pt-BR")} · Página ${page}/${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 7
    );
  }
  doc.save(fileName);
}
