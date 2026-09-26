import { jsPDF } from "jspdf";
import { hslToRgb } from "@/lib/branding";

export interface PreviewBrand {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  footerNote: string | null;
  poweredBy: string | null;
}

const loadImage = async (url: string): Promise<{ data: string; w: number; h: number } | null> => {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const data: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = data;
    });
    // jsPDF accepte PNG/JPEG ; on convertit via canvas pour les autres formats
    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = data; });
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return { data: canvas.toDataURL("image/png"), ...dims };
  } catch {
    return null;
  }
};

/** Génère un rapport d'exemple avec l'identité visuelle fournie. */
export const buildBrandingPreviewPdf = async (brand: PreviewBrand) => {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const primary = hslToRgb(brand.primaryColor);
  const secondary = hslToRgb(brand.secondaryColor, [249, 115, 22]);
  const text: [number, number, number] = [31, 41, 55];
  const muted: [number, number, number] = [107, 114, 128];

  doc.setFillColor(...primary);
  doc.rect(0, 0, w, 42, "F");
  doc.setFillColor(...secondary);
  doc.rect(0, 42, w, 3, "F");

  let textX = 20;
  let logoWarning = false;
  if (brand.logoUrl) {
    const logo = await loadImage(brand.logoUrl);
    if (logo) {
      const h = 26;
      const lw = Math.min(50, (logo.w / logo.h) * h);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(16, 8, lw + 8, h + 4, 2, 2, "F");
      doc.addImage(logo.data, "PNG", 20, 10, lw, h);
      textX = 20 + lw + 12;
    } else logoWarning = true;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(brand.companyName || "Nom de la société", textX, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Rapport d'exemple — aperçu de l'identité visuelle", textX, 31);

  let y = 58;
  doc.setTextColor(...text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("COORDONNÉES", 20, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const coords: [string, string | null][] = [
    ["Adresse", brand.address],
    ["Téléphone", brand.phone],
    ["Email", brand.email],
    ["Site web", brand.website],
    ["N° fiscal", brand.taxId],
  ];
  for (const [label, value] of coords) {
    doc.setTextColor(...muted);
    doc.text(label, 20, y);
    doc.setTextColor(...(value ? text : muted));
    doc.text(value || "Non renseigné", 60, y);
    y += 7;
  }

  y += 6;
  doc.setTextColor(...text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("EXEMPLE DE TABLEAU", 20, y);
  y += 6;
  doc.setFillColor(...primary);
  doc.rect(20, y, w - 40, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Produit", 24, y + 7);
  doc.text("Litres", w / 2, y + 7, { align: "center" });
  doc.text("Montant", w - 24, y + 7, { align: "right" });
  y += 10;
  const sample = [["Super", "1 250", "868 750 FCFA"], ["Gasoil", "980", "705 600 FCFA"]];
  doc.setFont("helvetica", "normal");
  sample.forEach((r, i) => {
    if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(20, y, w - 40, 10, "F"); }
    doc.setTextColor(...text);
    doc.text(r[0], 24, y + 7);
    doc.text(r[1], w / 2, y + 7, { align: "center" });
    doc.text(r[2], w - 24, y + 7, { align: "right" });
    y += 10;
  });
  doc.setFillColor(...secondary);
  doc.rect(20, y, w - 40, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("Total", 24, y + 7);
  doc.text("1 574 350 FCFA", w - 24, y + 7, { align: "right" });

  if (logoWarning) {
    doc.setTextColor(239, 68, 68);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Logo introuvable ou inaccessible à cette adresse.", 20, y + 22);
  }

  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(229, 231, 235);
  doc.line(20, h - 22, w - 20, h - 22);
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  const parts = [`© ${new Date().getFullYear()} ${brand.companyName}`];
  if (brand.footerNote) parts.push(brand.footerNote);
  doc.text(parts.join(" · "), w / 2, h - 15, { align: "center" });
  if (brand.poweredBy) doc.text(brand.poweredBy, w / 2, h - 10, { align: "center" });

  return { doc, logoWarning };
};
