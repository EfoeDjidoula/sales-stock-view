import { DOC_TONE, type DocState, type DocumentReportRow, type DocumentGroup } from "./docCompliance";
import { getActiveBrand, hslToRgb } from "./branding";

type Language = "fr" | "en";
const labels = (language: Language): Record<DocState, string> => language === "en"
  ? { expired: "Expired", urgent: "Urgent (≤15 days)", due_soon: "Due in 16–30 days", valid: "Valid (>30 days)", missing: "Missing" }
  : { expired: "Expiré", urgent: "Urgent (≤15 jours)", due_soon: "Échéance 16–30 jours", valid: "Valide (>30 jours)", missing: "Manquant" };

const rgb = (token: string) => hslToRgb(getComputedStyle(document.documentElement).getPropertyValue(`--report-${token}`).trim());
const argb = (value: [number, number, number]) => "FF" + value.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
const headers = (language: Language) => language === "en"
  ? ["Truck / driver", "Document", "Number", "Expiry date", "Days remaining", "Status"]
  : ["Camion / chauffeur", "Document", "Numéro", "Date d’échéance", "Jours restants", "État"];
const status = (row: DocumentReportRow, language: Language) => row.state !== "missing" ? labels(language)[row.state]
  : row.missingDocument ? (language === "en" ? "Missing document" : "Document manquant") : (language === "en" ? "Unknown expiry" : "Échéance non renseignée");
const cells = (row: DocumentReportRow, language: Language) => [row.name, row.type, row.number,
  row.expiresOn ? row.expiresOn.split("-").reverse().join("/") : "—", row.days ?? "—", status(row, language)];
const title = (group: DocumentGroup, language: Language) => language === "en"
  ? `Regulatory documents — ${group === "vehicles" ? "Trucks & tankers" : group === "drivers" ? "Drivers" : "Trucks & drivers"}`
  : `Documents réglementaires — ${group === "vehicles" ? "Camions & citernes" : group === "drivers" ? "Chauffeurs" : "Camions & chauffeurs"}`;
const legend = (language: Language) => language === "en"
  ? "Red: expired / 0–15 days · Orange: 16–30 days · Green: >30 days · Missing expiry: unknown"
  : "Rouge : expiré / 0–15 j · Orange : 16–30 j · Vert : >30 j · Échéance absente : inconnue";

export async function exportDocumentCompliance(rows: DocumentReportRow[], group: DocumentGroup, today: string, format: "xlsx" | "pdf", language: Language) {
  if (!rows.length) return;
  const brand = getActiveBrand();
  const filename = `documents-${group}-${today}`;
  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = brand.companyName;
    for (const category of ["vehicles", "drivers"] as const) {
      const mine = rows.filter((r) => r.entity === category);
      if (!mine.length) continue;
      const sheet = workbook.addWorksheet(category === "vehicles" ? (language === "en" ? "Trucks" : "Camions") : (language === "en" ? "Drivers" : "Chauffeurs"));
      sheet.columns = [30, 28, 25, 20, 18, 30].map((width) => ({ width }));
      const caption = `${brand.legalName || brand.companyName}${brand.countryName ? ` — ${brand.countryName}` : ""}`;
      for (const text of [caption, title(category, language), `${language === "en" ? "As of" : "Situation au"} ${today}`, legend(language)]) {
        const row = sheet.addRow([text]); sheet.mergeCells(row.number, 1, row.number, 6);
        row.alignment = { wrapText: true, vertical: "middle" }; row.height = 30;
      }
      const header = sheet.addRow(headers(language));
      header.font = { bold: true, color: { argb: argb(rgb("foreground")) } };
      header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(rgb("muted")) } };
      for (const entry of mine) {
        const row = sheet.addRow(cells(entry, language));
        row.alignment = { wrapText: true, vertical: "middle" }; row.height = 32;
        const stateCell = row.getCell(6);
        stateCell.font = { bold: true, color: { argb: argb(rgb(DOC_TONE[entry.state])) } };
        row.getCell(4).font = stateCell.font; row.getCell(5).font = stateCell.font;
      }
      sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: sheet.rowCount, column: 6 } };
      sheet.views = [{ state: "frozen", ySplit: 5 }];
      sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:5" };
    }
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = `${filename}.xlsx`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const [{ jsPDF }, { default: autoTable }, { preloadLetterheadLogo }] = await Promise.all([import("./pdf"), import("jspdf-autotable"), import("./pdfLetterhead")]);
  await preloadLetterheadLogo(brand.logoUrl);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.letterheadBrand = brand;
  let first = true;
  for (const category of ["vehicles", "drivers"] as const) {
    const mine = rows.filter((r) => r.entity === category);
    if (!mine.length) continue;
    if (!first) pdf.addPage();
    first = false;
    pdf.setTextColor(...rgb("foreground")); pdf.setFontSize(14); pdf.text(title(category, language), 14, 16);
    pdf.setFontSize(9); pdf.text(`${language === "en" ? "As of" : "Situation au"} ${today}`, 14, 23);
    pdf.setFontSize(8); pdf.text(legend(language), 14, 30);
    autoTable(pdf, {
      startY: 36, head: [headers(language)], body: mine.map((row) => cells(row, language)),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", textColor: rgb("foreground"), fillColor: rgb("background") },
      headStyles: { fillColor: rgb("muted"), textColor: rgb("foreground") },
      alternateRowStyles: { fillColor: rgb("background") },
      margin: { left: 14, right: 14, top: 14, bottom: 14 },
      didParseCell: (data) => {
        const row = mine[data.row.index];
        if (data.section === "body" && row && data.column.index >= 3) {
          data.cell.styles.textColor = rgb(DOC_TONE[row.state]);
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }
  pdf.save(`${filename}.pdf`);
}