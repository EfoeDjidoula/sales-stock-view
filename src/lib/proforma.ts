import { jsPDF } from "jspdf";
import type { PriceStructure, PriceElement } from "@/hooks/usePriceStructures";

export type ProductKey = "super" | "gasoil";

export interface TaxBreakdown {
  ttc: number; // prix TTC unitaire (FCFA / litre)
  baseTaxable: number; // base HT soumise à TVA (FCFA / litre)
  tva: number; // TVA unitaire (FCFA / litre)
  baseExoneree: number; // base exonérée / hors champ TVA (FCFA / litre)
  tvaRate: number; // taux de TVA appliqué (ex: 0.18)
}

const norm = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const findElement = (elements: PriceElement[], keywords: string[]): PriceElement | undefined =>
  elements.find((el) => {
    const label = norm(el.label);
    return keywords.every((k) => label.includes(norm(k)));
  });

const val = (el: PriceElement | undefined, product: ProductKey): number => {
  if (!el) return 0;
  const v = product === "super" ? el.super : el.gasoil;
  return v == null ? 0 : v;
};

/**
 * Dérive la ventilation fiscale (base taxable, TVA, base exonérée) d'un produit
 * à partir de la structure de prix officielle du Bénin.
 */
export const getTaxBreakdown = (structure: PriceStructure, product: ProductKey): TaxBreakdown => {
  const ttc = product === "super" ? structure.super_price : structure.gasoil_price;

  // Base HT soumise à TVA : "TOTAL HORS TAXES SUR ASSIETTE DOUANIERE ET FISC"
  const baseTaxableEl =
    findElement(structure.elements, ["TOTAL HORS TAXES", "ASSIETTE"]) ??
    findElement(structure.elements, ["TOTAL HORS TAXES"]);
  const baseTaxable = val(baseTaxableEl, product);

  // TVA : "TVA PRIX CESSION POMPE"
  const tvaEl =
    findElement(structure.elements, ["TVA", "PRIX CESSION POMPE"]) ??
    findElement(structure.elements, ["TVA", "CESSION"]);
  const tva = val(tvaEl, product);

  // Base exonérée / hors champ : reliquat du prix TTC
  const baseExoneree = Math.max(0, Math.round((ttc - baseTaxable - tva) * 1000) / 1000);

  const tvaRate = baseTaxable > 0 ? Math.round((tva / baseTaxable) * 100) / 100 : 0;

  return { ttc, baseTaxable, tva, baseExoneree, tvaRate };
};

export interface ProformaLine {
  product: ProductKey;
  productLabel: string;
  quantity: number;
  breakdown: TaxBreakdown;
}

export interface ProformaTotals {
  baseTaxable: number;
  baseExoneree: number;
  tva: number;
  ttc: number;
}

export const computeLineTotals = (line: ProformaLine) => ({
  baseTaxable: line.quantity * line.breakdown.baseTaxable,
  baseExoneree: line.quantity * line.breakdown.baseExoneree,
  tva: line.quantity * line.breakdown.tva,
  ttc: line.quantity * line.breakdown.ttc,
});

export const computeTotals = (lines: ProformaLine[]): ProformaTotals =>
  lines.reduce<ProformaTotals>(
    (acc, line) => {
      const t = computeLineTotals(line);
      return {
        baseTaxable: acc.baseTaxable + t.baseTaxable,
        baseExoneree: acc.baseExoneree + t.baseExoneree,
        tva: acc.tva + t.tva,
        ttc: acc.ttc + t.ttc,
      };
    },
    { baseTaxable: 0, baseExoneree: 0, tva: 0, ttc: 0 }
  );

// ---------- PDF ----------

const primaryColor: [number, number, number] = [245, 158, 11];
const textColor: [number, number, number] = [31, 41, 55];
const mutedColor: [number, number, number] = [107, 114, 128];
const headerBg: [number, number, number] = [31, 41, 55];
const totalBg: [number, number, number] = [254, 215, 170];

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export interface ProformaClientInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
}

export interface ProformaMeta {
  number: string;
  date: string; // YYYY-MM-DD
  client?: ProformaClientInfo | null;
  structureLabel?: string | null;
}

export const exportProformaPdf = (
  lines: ProformaLine[],
  meta: ProformaMeta,
  company = "YATT & CO ENERGY BENIN SA"
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE PROFORMA", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(company, pageWidth / 2, 25, { align: "center" });

  let y = 46;
  doc.setTextColor(...textColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Proforma N° : ${meta.number}`, 20, y);
  doc.text(
    `Date : ${new Date(meta.date + "T00:00:00").toLocaleDateString("fr-FR")}`,
    pageWidth - 20,
    y,
    { align: "right" }
  );
  y += 8;

  // Client block
  doc.setFont("helvetica", "bold");
  doc.text("Client :", 20, y);
  doc.setFont("helvetica", "normal");
  if (meta.client) {
    doc.text(meta.client.name, 40, y);
    y += 6;
    if (meta.client.address) {
      doc.setTextColor(...mutedColor);
      doc.text(meta.client.address, 40, y);
      y += 6;
    }
    if (meta.client.phone) {
      doc.setTextColor(...mutedColor);
      doc.text(`Tél : ${meta.client.phone}`, 40, y);
      y += 6;
    }
    if (meta.client.taxId) {
      doc.setTextColor(...mutedColor);
      doc.text(`IFU : ${meta.client.taxId}`, 40, y);
      y += 6;
    }
    doc.setTextColor(...textColor);
  } else {
    doc.setTextColor(...mutedColor);
    doc.text("Client de passage", 40, y);
    doc.setTextColor(...textColor);
    y += 6;
  }
  if (meta.structureLabel) {
    doc.setTextColor(...mutedColor);
    doc.setFontSize(9);
    doc.text(`Structure de prix : ${meta.structureLabel}`, 20, y);
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    y += 8;
  } else {
    y += 2;
  }

  // Table header
  const marginX = 20;
  const cols = [
    { key: "produit", label: "Produit", x: marginX + 2, align: "left" as const },
    { key: "qte", label: "Qté (L)", x: 78, align: "right" as const },
    { key: "puttc", label: "PU TTC", x: 108, align: "right" as const },
    { key: "taxable", label: "Base taxable", x: 145, align: "right" as const },
    { key: "exo", label: "Base exo.", x: 172, align: "right" as const },
    { key: "tva", label: "TVA", x: pageWidth - marginX - 2, align: "right" as const },
  ];
  const tableW = pageWidth - marginX * 2;
  const rowH = 9;

  doc.setFillColor(...headerBg);
  doc.rect(marginX, y, tableW, rowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  cols.forEach((c) => doc.text(c.label, c.x, y + 6, { align: c.align }));
  y += rowH;

  doc.setTextColor(...textColor);
  doc.setFontSize(8.5);
  lines.forEach((line, i) => {
    const t = computeLineTotals(line);
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(marginX, y, tableW, rowH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.text(line.productLabel, cols[0].x, y + 6);
    doc.text(fmt(line.quantity), cols[1].x, y + 6, { align: "right" });
    doc.text(fmt(line.breakdown.ttc), cols[2].x, y + 6, { align: "right" });
    doc.text(fmt(t.baseTaxable), cols[3].x, y + 6, { align: "right" });
    doc.text(fmt(t.baseExoneree), cols[4].x, y + 6, { align: "right" });
    doc.text(fmt(t.tva), cols[5].x, y + 6, { align: "right" });
    doc.setDrawColor(229, 231, 235);
    doc.line(marginX, y + rowH, marginX + tableW, y + rowH);
    y += rowH;
  });

  const totals = computeTotals(lines);
  y += 6;

  // Summary box
  const boxX = pageWidth - marginX - 90;
  const boxW = 90;
  const rows: [string, number, boolean][] = [
    ["Base taxable HT", totals.baseTaxable, false],
    ["Base exonérée", totals.baseExoneree, false],
    ["TVA (18%)", totals.tva, false],
    ["TOTAL TTC", totals.ttc, true],
  ];
  doc.setFontSize(9.5);
  rows.forEach(([label, value, isTotal]) => {
    if (isTotal) {
      doc.setFillColor(...totalBg);
      doc.rect(boxX, y - 5, boxW, 9, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.setTextColor(...textColor);
    doc.text(label, boxX + 2, y + 1);
    doc.text(`${fmt(value)} FCFA`, boxX + boxW - 2, y + 1, { align: "right" });
    y += 9;
  });

  y += 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...mutedColor);
  doc.text(
    "Facture proforma sans valeur comptable - Prix basés sur la structure officielle en vigueur au Bénin.",
    marginX,
    y
  );

  const safe = `proforma_${meta.number}`.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  doc.save(`${safe}.pdf`);
};
