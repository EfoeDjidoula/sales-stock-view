import { getActiveBrand, type BrandIdentity } from "@/lib/branding";

/** Hauteurs réservées (mm) : en-tête et pied de page du papier à en-tête. */
export const LETTERHEAD_TOP_MM = 24;
export const LETTERHEAD_BOTTOM_MM = 15;

let logoCache: { src: string; data: string; w: number; h: number } | null = null;

/** Convertit le logo (data URL ou lien) en PNG data URL, une fois, pour un dessin synchrone dans jsPDF. */
export async function preloadLetterheadLogo(src: string | null | undefined): Promise<void> {
  if (!src) { logoCache = null; return; }
  if (logoCache?.src === src) return;
  if (typeof Image === "undefined" || typeof document === "undefined") return;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("logo")); img.src = src; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    logoCache = { src, data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { logoCache = null; }
}

/** Lignes centrées du pied de page : IFU, banque, téléphone, adresse, e-mail (seulement si renseignés). */
export function footerLines(b: BrandIdentity): string[] {
  const l1 = [b.legalName || b.companyName, b.taxId ? `IFU : ${b.taxId}` : null, b.bankDetails ? `Banque : ${b.bankDetails}` : null].filter(Boolean).join("  ·  ");
  const l2 = [b.phone ? `Tél. : ${b.phone}` : null, b.address, b.email, b.website].filter(Boolean).join("  ·  ");
  return [l1, l2].filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

/** Dessine l'en-tête (logo à gauche, société + descriptif au centre) et le pied de page (coordonnées au centre, éditeur à droite). */
export function drawLetterhead(doc: Doc, page: number, pages: number, brand: BrandIdentity = getActiveBrand()) {
  const k = doc.internal.scaleFactor as number; // pt par unité
  const W = doc.internal.pageSize.getWidth() as number;
  const H = doc.internal.pageSize.getHeight() as number;
  const mm = (v: number) => (v * 72) / 25.4 / k; // mm -> unités du document
  const top = mm(LETTERHEAD_TOP_MM), bottom = mm(LETTERHEAD_BOTTOM_MM), m = mm(10);
  doc.saveGraphicsState?.();
  doc.setTextColor(30, 30, 30);
  if (logoCache) {
    const maxH = mm(16), maxW = mm(38);
    const r = Math.min(maxW / logoCache.w, maxH / logoCache.h);
    try { doc.addImage(logoCache.data, "PNG", m, mm(4), logoCache.w * r, logoCache.h * r); } catch { /* logo illisible : ignoré */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(brand.companyName || brand.legalName, W / 2, mm(10), { align: "center" });
  const desc = brand.appDescription || (brand.legalName !== brand.companyName ? brand.legalName : "");
  if (desc) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(doc.splitTextToSize(desc, W - mm(100)).slice(0, 2), W / 2, mm(15), { align: "center" }); }
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(mm(0.3));
  doc.line(m, top - mm(2), W - m, top - mm(2));
  doc.line(m, H - bottom + mm(1.5), W - m, H - bottom + mm(1.5));
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90, 90, 90);
  footerLines(brand).forEach((t, i) => doc.text(doc.splitTextToSize(t, W - mm(90))[0], W / 2, H - bottom + mm(5.5 + i * 3.6), { align: "center" }));
  doc.text(brand.poweredBy || "LUMATEK TECHNOLOGY", W - m, H - bottom + mm(5.5), { align: "right" });
  doc.text(`Page ${page}/${pages}`, W - m, H - bottom + mm(9.1), { align: "right" });
  doc.restoreGraphicsState?.();
}
