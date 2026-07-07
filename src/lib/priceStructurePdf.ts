import { jsPDF } from "jspdf";
import type { PriceStructure } from "@/hooks/usePriceStructures";

const primaryColor: [number, number, number] = [245, 158, 11];
const textColor: [number, number, number] = [31, 41, 55];
const mutedColor: [number, number, number] = [107, 114, 128];

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

  // Table header
  const col1 = 20;
  const col2 = pageWidth - 90;
  const col3 = pageWidth - 20;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...textColor);
  doc.text("Élément", col1, y);
  doc.text("Super", col2, y, { align: "right" });
  doc.text("Gasoil", col3, y, { align: "right" });
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(20, y, pageWidth - 20, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const el of s.elements) {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...textColor);
    const label = doc.splitTextToSize(el.label, col2 - col1 - 25) as string[];
    doc.text(label[0], col1, y);
    doc.text(fmt(el.super), col2, y, { align: "right" });
    doc.text(fmt(el.gasoil), col3, y, { align: "right" });
    y += 6;
  }

  const safe = (s.label || `structure_${s.country}_${s.effective_date}`)
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  doc.save(`${safe}.pdf`);
};
