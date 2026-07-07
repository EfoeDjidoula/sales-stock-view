import { jsPDF } from "jspdf";
import type { PriceStructure } from "@/hooks/usePriceStructures";

const primaryColor: [number, number, number] = [245, 158, 11];
const textColor: [number, number, number] = [31, 41, 55];
const mutedColor: [number, number, number] = [107, 114, 128];
const headerBg: [number, number, number] = [31, 41, 55];
const stripeBg: [number, number, number] = [249, 250, 251];
const majorBg: [number, number, number] = [255, 237, 213]; // amber-100
const totalBg: [number, number, number] = [254, 215, 170]; // amber-200

const fmt = (n: number | null) =>
  n == null
    ? "-"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const dateFr = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

// Keywords that identify "grandes lignes" (major/subtotal/total rows) to highlight
const MAJOR_KEYWORDS = ["TOTAL", "SOUS-TOTAL", "SOUS TOTAL", "PRIX", "CESSION", "MARGE", "STRUCTURE"];
const TOTAL_KEYWORDS = ["PRIX OFFICIEL", "PRIX DE VENTE", "TOTAL PRIX", "PRIX CESSION"];

const rowStyle = (label: string): "total" | "major" | "normal" => {
  const up = label.toUpperCase();
  if (TOTAL_KEYWORDS.some((k) => up.includes(k))) return "total";
  if (MAJOR_KEYWORDS.some((k) => up.includes(k))) return "major";
  return "normal";
};

export const exportPriceStructurePdf = (s: PriceStructure) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Structure de prix", pageWidth / 2, 16, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(s.label || `Structure ${s.country}`, pageWidth / 2, 26, { align: "center" });

  let y = 48;
  doc.setTextColor(...textColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Pays : ${s.country}`, 20, y);
  doc.text(`Date d'application : ${dateFr(s.effective_date)}`, pageWidth - 20, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);
  doc.text(`Statut : ${s.is_active ? "Active" : "Inactive"}`, 20, y);
  y += 10;

  // Selling prices highlight
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(20, y, pageWidth - 40, 20, 3, 3, "F");
  doc.setTextColor(...textColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Prix Super : ${fmt(s.super_price)} FCFA`, 28, y + 12);
  doc.text(`Prix Gasoil : ${fmt(s.gasoil_price)} FCFA`, pageWidth / 2 + 4, y + 12);
  y += 32;

  // Table layout
  const marginX = 20;
  const tableW = pageWidth - marginX * 2;
  const rowH = 9;
  const colSuperX = pageWidth - 90;
  const colGasoilX = pageWidth - marginX;
  const labelX = marginX + 4;

  const drawTableHeader = () => {
    doc.setFillColor(...headerBg);
    doc.rect(marginX, y, tableW, rowH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Élément", labelX, y + 6);
    doc.text("Super", colSuperX, y + 6, { align: "right" });
    doc.text("Gasoil", colGasoilX - 4, y + 6, { align: "right" });
    y += rowH;
  };

  drawTableHeader();

  doc.setFontSize(9);
  s.elements.forEach((el, index) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
      drawTableHeader();
    }

    const style = rowStyle(el.label);

    // Row background
    if (style === "total") {
      doc.setFillColor(...totalBg);
      doc.rect(marginX, y, tableW, rowH, "F");
    } else if (style === "major") {
      doc.setFillColor(...majorBg);
      doc.rect(marginX, y, tableW, rowH, "F");
    } else if (index % 2 === 0) {
      doc.setFillColor(...stripeBg);
      doc.rect(marginX, y, tableW, rowH, "F");
    }

    doc.setTextColor(...textColor);
    doc.setFont("helvetica", style === "normal" ? "normal" : "bold");
    const label = doc.splitTextToSize(el.label, colSuperX - labelX - 25) as string[];
    doc.text(label[0], labelX, y + 6);
    doc.text(fmt(el.super), colSuperX, y + 6, { align: "right" });
    doc.text(fmt(el.gasoil), colGasoilX - 4, y + 6, { align: "right" });

    // Row separator
    doc.setDrawColor(229, 231, 235);
    doc.line(marginX, y + rowH, marginX + tableW, y + rowH);
    y += rowH;
  });

  // Outer table border
  doc.setDrawColor(...mutedColor);

  const safe = (s.label || `structure_${s.country}_${s.effective_date}`)
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  doc.save(`${safe}.pdf`);
};
