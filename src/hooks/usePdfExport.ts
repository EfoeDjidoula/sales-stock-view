import { getActiveBrand, hslToRgb, documentFooter } from "@/lib/branding";
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
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v)}`;

export const usePdfExport = () => {
  const exportPdf = (data: DailyRecapData) => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const brand = getActiveBrand();
    const primary: [number, number, number] = hslToRgb(brand.primaryColor);
    const text: [number, number, number] = [31, 41, 55];
    const muted: [number, number, number] = [107, 114, 128];
    const ok: [number, number, number] = [22, 163, 74];
    const bad: [number, number, number] = [220, 38, 38];

    doc.setFillColor(...primary);
    doc.rect(0, 0, W, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(brand.legalName, W / 2, 15, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Récapitulatif journalier des index", W / 2, 25, { align: "center" });

    let y = 46;
    doc.setTextColor(...text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(data.stationName, 15, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(data.stationLocation || "", 15, y + 5);
    doc.setTextColor(...primary);
    doc.setFontSize(10);
    doc.text(
      new Date(data.date).toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      W - 15,
      y,
      { align: "right" },
    );
    y += 14;

    const section = (title: string) => {
      if (y > H - 40) { doc.addPage(); y = 20; }
      doc.setTextColor(...text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, 15, y);
      y += 3;
      doc.setDrawColor(229, 231, 235);
      doc.line(15, y, W - 15, y);
      y += 6;
    };

    const table = (headers: string[], rows: string[][], widths: number[]) => {
      const x0 = 15;
      const drawRow = (cells: string[], bold: boolean, fill?: [number, number, number]) => {
        if (y > H - 20) { doc.addPage(); y = 20; }
        if (fill) { doc.setFillColor(...fill); doc.rect(x0, y - 4.5, W - 30, 6.5, "F"); }
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...text);
        let x = x0;
        cells.forEach((c, i) => {
          if (i === 0) doc.text(c, x + 1.5, y);
          else doc.text(c, x + widths[i] - 1.5, y, { align: "right" });
          x += widths[i];
        });
        y += 6.5;
      };
      drawRow(headers, true, [243, 244, 246]);
      rows.forEach((r, i) => drawRow(r, i === rows.length - 1 && r[0] === "TOTAL", i % 2 ? [249, 250, 251] : undefined));
      y += 3;
    };

    const line = (label: string, value: string, opts: { bold?: boolean; color?: [number, number, number]; fill?: [number, number, number] } = {}) => {
      if (y > H - 20) { doc.addPage(); y = 20; }
      if (opts.fill) { doc.setFillColor(...opts.fill); doc.roundedRect(15, y - 5, W - 30, 8, 1.5, 1.5, "F"); }
      doc.setFontSize(9.5);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setTextColor(...text);
      doc.text(label, 18, y);
      doc.setTextColor(...(opts.color || text));
      doc.text(value, W - 18, y, { align: "right" });
      y += 8;
    };

    // 1. Index & sorties
    section("1. SORTIES AUX PISTOLETS");
    const tot = {
      brut: data.super.brut + data.gasoil.brut,
      retour: data.super.retour + data.gasoil.retour,
      liters: data.super.liters + data.gasoil.liters,
    };
    table(
      ["Produit", "Quantité (L)", "Retour cuve (L)", "Sortie réelle (L)", "P.U.", "Montant (FCFA)"],
      [
        ["Super", formatNumber(data.super.brut), formatNumber(data.super.retour), formatNumber(data.super.liters), formatNumber(data.prices.super), formatNumber(data.super.amount)],
        ["Gasoil", formatNumber(data.gasoil.brut), formatNumber(data.gasoil.retour), formatNumber(data.gasoil.liters), formatNumber(data.prices.gasoil), formatNumber(data.gasoil.amount)],
        ["TOTAL", formatNumber(tot.brut), formatNumber(tot.retour), formatNumber(tot.liters), "", formatNumber(data.venteGlobale)],
      ],
      [30, 28, 30, 32, 20, 40],
    );

    // 2. Détail des ventes
    section("2. DÉTAIL DES VENTES & VERSEMENT");
    line("Vente globale", `${formatNumber(data.venteGlobale)} FCFA`, { bold: true, color: primary, fill: [255, 251, 235] });
    line("− Autoconsommation", `${formatNumber(data.autoconso)} FCFA`);
    line("− Bons clients", `${formatNumber(data.bonsClients)} FCFA`);
    line("− Tickets valeur", `${formatNumber(data.ticketsValeur)} FCFA`);
    line("− Ventes par carte", `${formatNumber(data.cartes)} FCFA`);
    line(`− Mobile Money${data.momoRef ? ` (réf. ${data.momoRef})` : ""}`, `${formatNumber(data.momo)} FCFA`);
    line("= Montant à verser en banque", `${formatNumber(data.montantAVerser)} FCFA`, { bold: true, fill: [243, 244, 246] });
    const bvInfo = [data.banqueNom, data.bordereau ? `BV ${data.bordereau}` : ""].filter(Boolean).join(" · ");
    line(`Versement banque${bvInfo ? ` (${bvInfo})` : ""}`, `${formatNumber(data.versementBanque)} FCFA`);
    const ecColor = data.ecartVersement < 0 ? bad : ok;
    line(
      data.ecartVersement < 0 ? "Écart sur versement (manquant)" : "Écart sur versement",
      `${signed(data.ecartVersement)} FCFA`,
      { bold: true, color: ecColor, fill: data.ecartVersement < 0 ? [254, 242, 242] : [240, 253, 244] },
    );
    y += 2;

    // 3. Suivi stock
    if (data.tanks.length) {
      section("3. SUIVI STOCK PAR CUVE");
      table(
        ["Cuve", "Ouverture", "Dépotage", "Sortie", "Clôture théo.", "Jauge", "Écart"],
        data.tanks.map((t) => [
          `${t.name} (${t.product === "super" ? "Super" : "Gasoil"})`,
          formatNumber(t.ouverture),
          formatNumber(t.depotage),
          formatNumber(t.sortie),
          formatNumber(t.cloture),
          formatNumber(t.jauge),
          signed(t.ecart),
        ]),
        [44, 22, 22, 22, 26, 22, 22],
      );
    }

    y = Math.max(y + 4, H - 18);
    if (y > H - 10) { doc.addPage(); y = H - 18; }
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Document généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
      W / 2,
      y,
      { align: "center" },
    );
    doc.text(documentFooter(brand), W / 2, y + 5, { align: "center" });

    doc.save(`Recap_${data.stationName.replace(/\s+/g, "_")}_${data.date}.pdf`);
  };

  return { exportPdf };
};
