import { getActiveBrand, hslToRgb } from "@/lib/branding";
import { jsPDF } from "@/lib/pdf";
import { formatNumber } from "@/data/stationsData";

export interface DailyRecapTank {
  name: string;
  product: "super" | "gasoil";
  ouverture: number;
  depotage: number;
  sortie: number;
  cloture: number;
  jauge: number;
  ecart: number;
}

export interface DailyRecapNozzle {
  name: string;
  product: "super" | "gasoil";
  depart: number;
  arrivee: number;
  retour: number;
}

export interface DailyRecapData {
  stationName: string;
  stationLocation: string;
  date: string;
  prices: { super: number; gasoil: number };
  super: { brut: number; retour: number; liters: number; amount: number };
  gasoil: { brut: number; retour: number; liters: number; amount: number };
  venteGlobale: number;
  autoconso: number;
  bonsClients: number;
  ticketsValeur: number;
  cartes: number;
  momo: number;
  momoRef?: string;
  montantAVerser: number;
  versementBanque: number;
  bordereau?: string;
  banqueNom?: string;
  ecartVersement: number;
  tanks: DailyRecapTank[];
  /** Index par pistolet (départ, arrivée, retour en cuve). */
  nozzles?: DailyRecapNozzle[];
  /** Statut de validation N+1 (absent = saisie en cours). */
  validation?: { status?: string; by?: string | null; at?: string | null; reason?: string | null };
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v)}`;

type RGB = [number, number, number];
interface Cell { t: string; color?: RGB; bold?: boolean }
type Row = { cells: (string | Cell)[]; total?: boolean; fill?: RGB };

/** Récapitulatif journalier tenu sur une seule page A4 : chaque section est un tableau. */
export const usePdfExport = () => {
  const exportPdf = (data: DailyRecapData) => {
    const doc = new jsPDF({ format: "a4", unit: "mm" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;
    const TW = W - 2 * M;
    const brand = getActiveBrand();
    const primary: RGB = hslToRgb(brand.primaryColor);
    const text: RGB = [31, 41, 55];
    const muted: RGB = [107, 114, 128];
    const ok: RGB = [22, 163, 74];
    const bad: RGB = [220, 38, 38];
    const grid: RGB = [209, 213, 219];
    const fmt = formatNumber;

    const nz = [...(data.nozzles ?? [])].sort((a, b) => (a.product === b.product ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.product === "super" ? -1 : 1));
    const sections = (nz.length ? 1 : 0) + 3 + (data.tanks.length ? 1 : 0);
    // Lignes de tableau (en-têtes compris) pour calibrer la hauteur et tenir sur une page.
    const rowCount = (nz.length ? nz.length + 2 : 0) + 4 + 10 + (data.tanks.length ? data.tanks.length + 1 : 0) + 3;
    const fixed = 22 + 10 + 9 + sections * 7.5 + 26 + 12; // en-tête, station, statut, titres, visas, pied
    const rh = Math.min(5.6, Math.max(3.4, (H - 2 * 6 - fixed) / rowCount));
    const fs = Math.min(8.5, Math.max(6, rh * 1.5));

    // En-tête
    doc.setFillColor(...primary);
    doc.rect(0, 0, W, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    // La raison sociale du pays figure déjà sur le papier à en-tête : le bandeau porte le titre du rapport.
    doc.text("Récapitulatif journalier des index et des ventes", W / 2, 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    if (brand.countryName) doc.text(`Pays : ${brand.countryName}`, W / 2, 17, { align: "center" });

    let y = 29;
    doc.setTextColor(...text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(data.stationName + (data.stationLocation ? `  ·  ${data.stationLocation}` : ""), M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text(new Date(data.date).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }), W - M, y, { align: "right" });
    y += 6;

    const v = data.validation;
    const st = v?.status ?? "brouillon";
    const label = st === "valide" ? `VALIDÉ N+1${v?.by ? ` par ${v.by}` : ""}${v?.at ? ` le ${new Date(v.at).toLocaleString("fr-FR")}` : ""}`
      : st === "rejete" ? `REJETÉ N+1${v?.by ? ` par ${v.by}` : ""}${v?.reason ? ` · Motif : ${v.reason}` : ""}`
      : st === "pre_enregistre" ? "PRÉ-ENREGISTRÉ · en attente de validation N+1 (chiffres provisoires)"
      : "BROUILLON · saisie non enregistrée (chiffres provisoires)";
    const tone: RGB = st === "valide" ? ok : st === "rejete" ? bad : [217, 119, 6];
    doc.setFillColor(...tone);
    doc.roundedRect(M, y, TW, 6.5, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(label, TW - 6)[0], W / 2, y + 4.4, { align: "center" });
    y += 11;

    const section = (title: string) => {
      doc.setTextColor(...primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(title, M, y + 3);
      y += 5.5;
    };

    /** Tableau quadrillé : en-tête couleur marque, 1re colonne à gauche, autres à droite. */
    const table = (headers: string[], rows: Row[], ratios: number[], align?: ("l" | "r")[]) => {
      const sum = ratios.reduce((a, b) => a + b, 0);
      const widths = ratios.map((r) => (r / sum) * TW);
      const al = (i: number) => align?.[i] ?? (i === 0 ? "l" : "r");
      const draw = (cells: (string | Cell)[], kind: "head" | "row" | "total", fill?: RGB) => {
        if (kind === "head") doc.setFillColor(...primary);
        else if (fill) doc.setFillColor(...fill);
        if (kind === "head" || fill) doc.rect(M, y, TW, rh, "F");
        doc.setDrawColor(...grid);
        doc.setLineWidth(0.15);
        let x = M;
        widths.forEach((w) => { doc.rect(x, y, w, rh); x += w; });
        x = M;
        doc.setFontSize(kind === "head" ? fs - 0.3 : fs);
        cells.forEach((c, i) => {
          const cell: Cell = typeof c === "string" ? { t: c } : c;
          doc.setFont("helvetica", kind !== "row" || cell.bold ? "bold" : "normal");
          doc.setTextColor(...(kind === "head" ? ([255, 255, 255] as RGB) : cell.color ?? text));
          const ty = y + rh / 2 + fs * 0.12;
          const txt = doc.splitTextToSize(cell.t, widths[i] - 2.4)[0] ?? "";
          if (al(i) === "l") doc.text(txt, x + 1.2, ty);
          else doc.text(txt, x + widths[i] - 1.2, ty, { align: "right" });
          x += widths[i];
        });
        y += rh;
      };
      draw(headers, "head");
      rows.forEach((r, i) => draw(r.cells, r.total ? "total" : "row", r.total ? [243, 244, 246] : r.fill ?? (i % 2 ? [249, 250, 251] : undefined)));
      y += 3;
    };

    let n = 0;
    // 1. Index par pistolet
    if (nz.length) {
      section(`${++n}. RÉSUMÉ DES INDEX PAR PISTOLET`);
      const rows: Row[] = nz.map((r) => {
        const brut = Math.max(r.arrivee - r.depart, 0);
        return { cells: [r.name, r.product === "super" ? "Super" : "Gasoil", fmt(r.depart), fmt(r.arrivee), fmt(brut), fmt(r.retour), fmt(Math.max(brut - r.retour, 0))] };
      });
      const tb = nz.reduce((s, r) => s + Math.max(r.arrivee - r.depart, 0), 0);
      const tr = nz.reduce((s, r) => s + r.retour, 0);
      rows.push({ total: true, cells: ["TOTAL", "", "", "", fmt(tb), fmt(tr), fmt(Math.max(tb - tr, 0))] });
      table(["Pistolet", "Produit", "Index départ", "Index arrivée", "Brut (L)", "Retour cuve (L)", "Net (L)"], rows, [20, 14, 22, 22, 17, 18, 17], ["l", "l"]);
    }

    // 2. Sorties par produit
    section(`${++n}. SORTIES ET VENTES PAR PRODUIT`);
    const tot = { brut: data.super.brut + data.gasoil.brut, retour: data.super.retour + data.gasoil.retour, liters: data.super.liters + data.gasoil.liters };
    table(
      ["Produit", "Quantité brute (L)", "Retour cuve (L)", "Sortie réelle (L)", "Prix structure (FCFA/L)", "Montant (FCFA)"],
      [
        { cells: ["Super", fmt(data.super.brut), fmt(data.super.retour), fmt(data.super.liters), fmt(data.prices.super), fmt(data.super.amount)] },
        { cells: ["Gasoil", fmt(data.gasoil.brut), fmt(data.gasoil.retour), fmt(data.gasoil.liters), fmt(data.prices.gasoil), fmt(data.gasoil.amount)] },
        { total: true, cells: ["TOTAL", fmt(tot.brut), fmt(tot.retour), fmt(tot.liters), "", fmt(data.venteGlobale)] },
      ],
      [16, 20, 18, 20, 22, 22],
    );

    // 3. Ventes & versement
    section(`${++n}. DÉTAIL DES VENTES ET VERSEMENT BANQUE`);
    const bvInfo = [data.banqueNom, data.bordereau ? `BV ${data.bordereau}` : ""].filter(Boolean).join(" · ");
    const ecColor = data.ecartVersement < 0 ? bad : ok;
    table(
      ["Rubrique", "Référence", "Montant (FCFA)"],
      [
        { fill: [255, 251, 235], cells: [{ t: "Vente globale", bold: true }, "", { t: fmt(data.venteGlobale), bold: true, color: primary }] },
        { cells: ["- Autoconsommation", "", fmt(data.autoconso)] },
        { cells: ["- Bons clients", "", fmt(data.bonsClients)] },
        { cells: ["- Tickets valeur", "", fmt(data.ticketsValeur)] },
        { cells: ["- Ventes par carte", "", fmt(data.cartes)] },
        { cells: ["- Mobile Money", data.momoRef ?? "", fmt(data.momo)] },
        { total: true, cells: ["= Montant à verser en banque", "", fmt(data.montantAVerser)] },
        { cells: ["Versement banque déclaré", bvInfo, fmt(data.versementBanque)] },
        {
          fill: data.ecartVersement < 0 ? [254, 242, 242] : [240, 253, 244],
          cells: [{ t: data.ecartVersement < 0 ? "Écart sur versement (manquant)" : "Écart sur versement", bold: true }, "", { t: signed(data.ecartVersement), bold: true, color: ecColor }],
        },
      ],
      [50, 30, 25],
      ["l", "l", "r"],
    );

    // 4. Suivi stock
    if (data.tanks.length) {
      section(`${++n}. SUIVI STOCK PAR CUVE (L)`);
      table(
        ["Cuve", "Ouverture", "Dépotage", "Sortie", "Clôture théo.", "Jauge", "Écart"],
        data.tanks.map((t) => ({
          cells: [
            `${t.name} (${t.product === "super" ? "Super" : "Gasoil"})`,
            fmt(t.ouverture), fmt(t.depotage), fmt(t.sortie), fmt(t.cloture), fmt(t.jauge),
            { t: signed(t.ecart), bold: true, color: t.ecart < 0 ? bad : t.ecart > 0 ? ok : text },
          ],
        })),
        [30, 16, 16, 16, 18, 16, 16],
      );
    }

    // Visas (tableau à deux cases)
    if (y > H - 38) { doc.addPage(); y = 20; }
    const half = TW / 2;
    doc.setFillColor(...primary);
    doc.rect(M, y, TW, rh, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs); doc.setTextColor(255, 255, 255);
    doc.text("Visa gérant", M + 1.2, y + rh / 2 + fs * 0.12);
    doc.text("Visa N+1", M + half + 1.2, y + rh / 2 + fs * 0.12);
    doc.setDrawColor(...grid);
    doc.rect(M, y, half, rh + 18); doc.rect(M + half, y, half, rh + 18);
    if (st === "valide" && v?.by) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...muted);
      doc.text(`${v.by}${v.at ? ` · ${new Date(v.at).toLocaleDateString("fr-FR")}` : ""}`, M + half + 1.2, y + rh + 4);
    }

    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.text(`Document généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`, W / 2, H - 6, { align: "center" });

    doc.save(`Recap_${data.stationName.replace(/\s+/g, "_")}_${data.date}.pdf`);
  };

  return { exportPdf };
};
