/** Exports de l'arrêté des comptes (Excel fidèle au modèle papier + PDF sur papier à en-tête). */
import ExcelJS from "exceljs";
import { jsPDF } from "@/lib/pdf";
import { fuelTotals, type MonthDeliveries, type PeriodSales, type TankLine, type Valuation } from "@/lib/accountClosing";
import type { PumpSummary } from "@/lib/managerAccount";

export const MOTIFS = {
  periodique: "Contrôle périodique",
  prix: "Changement de prix de vente",
  gerance: "Passation de gérance",
} as const;
export type Motif = keyof typeof MOTIFS;

export interface StationClosing {
  company: string;
  stationName: string;
  motif: Motif;
  gerant: string;
  gerantEntrant: string;
  dateReprise: string;
  prevControl: string;
  control: string;
  includePending: boolean;
  prices: { super: number; gasoil: number };
  tanks: TankLine[];
  deliveries: { rows: MonthDeliveries[]; total: MonthDeliveries };
  sales: { rows: PeriodSales[]; total: PeriodSales };
  pumps: (PumpSummary & { name: string })[];
  valuation: Valuation;
  missing: string[];
  /** Mention de validation (arrêtés archivés uniquement). */
  validation?: { reference: string; by: string; at: string; cancelled?: string | null };
}

export interface NetworkClosing {
  company: string;
  prevControl: string;
  control: string;
  includePending: boolean;
  stations: { name: string; tanks: TankLine[]; sales: PeriodSales }[];
}

export const dateFr = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR") : "—");
const n0 = (v: number) => (Number(v) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const n2 = (v: number) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fuelLabel = (f: string) => (f === "super" ? "Super" : f === "gasoil" ? "Gasoil" : "Autre");
const SIGNATAIRES = ["POUR CONTRÔLE", "COMPTABILITÉ", "DIR. EXPLOITATION", "DIRECTEUR GÉNÉRAL"];

export function headerLines(s: StationClosing): string[] {
  const l = [`ARRÊTÉ DE COMPTES : STATION ${s.stationName.toUpperCase()}`, `Motif : ${MOTIFS[s.motif]}`];
  l.push(`Gérant${s.motif === "gerance" ? " sortant" : ""} : ${s.gerant || "—"}${s.motif === "gerance" ? `   ·   Gérant entrant : ${s.gerantEntrant || "—"}` : ""}`);
  if (s.dateReprise) l.push(`Date de prise de la station : ${dateFr(s.dateReprise)}`);
  l.push(`Date du contrôle précédent : ${dateFr(s.prevControl)}   ·   Date du contrôle actuel : ${dateFr(s.control)}`);
  if (s.validation) l.push(`Arrêté ${s.validation.reference} validé électroniquement par ${s.validation.by} le ${new Date(s.validation.at).toLocaleString("fr-FR")}${s.validation.cancelled ? ` — ANNULÉ : ${s.validation.cancelled}` : " — verrouillé"}`);
  l.push(`PU retenus : Super ${n0(s.prices.super)} · Gasoil ${n0(s.prices.gasoil)} FCFA/L   ·   ${s.includePending ? "Saisies validées + en attente" : "Saisies validées N+1"}`);
  return l;
}

const saleCells = (p: PeriodSales) => [p.montant, p.bonsSociete, p.bonsClients, p.tickets, p.cartes, p.venteReelle, p.momo, p.liquidite, p.versementBanque, p.ecart];
export const SALE_HEADERS = ["Montant", "Bons société", "Bons clients", "Tickets valeur", "Cartes", "Vente réelle", "MoMo", "Liquidité", "Versement banque", "Écart"];
export const TANK_HEADERS = ["Stock initial", "Approv. (BL)", "Sorties index", "SF théorique", "Jauge contrôle", "Écart", "Écart valorisé"];
const tankCells = (t: Pick<TankLine, "stockInitial" | "approv" | "sortie" | "theorique" | "jauge" | "ecart" | "ecartValorise">) =>
  [t.stockInitial, t.approv, t.sortie, t.theorique, t.jauge, t.ecart, t.ecartValorise];

async function download(wb: ExcelJS.Workbook, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
  a.download = name;
  a.click();
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_");

function bold(row: ExcelJS.Row) { row.font = { bold: true }; return row; }

function stationSheet(wb: ExcelJS.Workbook, s: StationClosing) {
  const ws = wb.addWorksheet(s.stationName.slice(0, 28) || "Station");
  bold(ws.addRow([s.company])).font = { bold: true, size: 13 };
  headerLines(s).forEach((l, i) => (i === 0 ? bold(ws.addRow([l])) : ws.addRow([l])));
  ws.addRow([]);
  bold(ws.addRow(["A. LIVRAISON DE PRODUITS SUR LA STATION"]));
  bold(ws.addRow(["Mois", "Période", "Nbre de BL", ...s.tanks.map((t) => t.name)]));
  s.tanks.forEach((t) => ws.addRow([dateFr(addOne(s.prevControl)), `Stock ${t.name} au ${dateFr(addOne(s.prevControl))}`, "", ...s.tanks.map((x) => (x.tankId === t.tankId ? t.stockInitial : null))]));
  s.deliveries.rows.forEach((m) => ws.addRow([m.label, `${dateFr(m.from)} – ${dateFr(m.to)}`, m.nbBl, ...s.tanks.map((t) => m.byTank[t.tankId] ?? 0)]));
  bold(ws.addRow([s.deliveries.total.label, "", s.deliveries.total.nbBl, ...s.tanks.map((t) => s.deliveries.total.byTank[t.tankId] ?? 0)]));
  ws.addRow([]);
  bold(ws.addRow(["B. VALORISATION DU STOCK ET DES CHARGEMENTS", "Qté", "PU", "Montant"]));
  s.valuation.lines.forEach((l) => ws.addRow([l.label, l.qty, l.pu, l.montant]));
  bold(ws.addRow(["Total approvisionnement valorisé", "", "", s.valuation.approvisionnement]));
  ws.addRow([]);
  bold(ws.addRow(["C. VENTES ET VERSEMENTS PÉRIODIQUES"]));
  bold(ws.addRow(["Périodes", ...SALE_HEADERS]));
  s.sales.rows.forEach((p) => ws.addRow([p.label, ...saleCells(p)]));
  bold(ws.addRow(["TOTAL", ...saleCells(s.sales.total)]));
  ws.addRow([]);
  bold(ws.addRow(["D. TRAITEMENT DES INDEX ET SORTIES DE LA PÉRIODE"]));
  bold(ws.addRow(["Pompes", "Index arrivée", "Index départ", "Sorties", "Retour cuve", "Sortie réelle", "PU", "Montant"]));
  s.pumps.forEach((p) => {
    const pu = p.fuel === "super" ? s.prices.super : p.fuel === "gasoil" ? s.prices.gasoil : 0;
    ws.addRow([p.name, p.indexFin, p.indexDebut, p.brut, p.retour, p.net, pu, p.net * pu]);
  });
  bold(ws.addRow(["TOTAL DES VENTES SUR INDEX (montants du jour)", "", "", "", "", "", "", s.valuation.ventes]));
  ws.addRow([]);
  bold(ws.addRow(["E. DÉTERMINATION ET VALORISATION DES ÉCARTS SUR STOCK"]));
  bold(ws.addRow(["Cuves", ...TANK_HEADERS]));
  s.tanks.forEach((t) => ws.addRow([t.name, ...tankCells(t)]));
  bold(ws.addRow(["Total écarts valorisés", "", "", "", "", "", "", s.valuation.sommeEcartsValorises]));
  ws.addRow([]);
  bold(ws.addRow(["BALANCE"]));
  ([["Approvisionnement valorisé", s.valuation.approvisionnement], ["Ventes", s.valuation.ventes], ["Balance", s.valuation.balance], ["Stock contrôle valorisé", s.valuation.stockControle], ["Écart", s.valuation.ecart]] as [string, number][])
    .forEach((r) => ws.addRow(r));
  ws.addRow([]);
  const sig = s.motif === "gerance" ? ["GÉRANT SORTANT", "GÉRANT ENTRANT", ...SIGNATAIRES] : ["GÉRANT", ...SIGNATAIRES];
  bold(ws.addRow(sig));
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 40 : 16; c.numFmt = "#,##0.00"; });
}

const addOne = (d: string) => { if (!d) return d; const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function exportStationXlsx(s: StationClosing) {
  const wb = new ExcelJS.Workbook();
  stationSheet(wb, s);
  await download(wb, `Arrete_comptes_${safe(s.stationName)}_${s.prevControl}_au_${s.control}.xlsx`);
}

export async function exportNetworkXlsx(n: NetworkClosing) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BILAN CTRL");
  bold(ws.addRow([n.company])).font = { bold: true, size: 13 };
  bold(ws.addRow([`BILAN DU CONTRÔLE DES STATIONS SUR LA PÉRIODE DU ${dateFr(addOne(n.prevControl))} AU ${dateFr(n.control)}`]));
  ws.addRow([n.includePending ? "Saisies validées + en attente" : "Saisies validées N+1"]);
  ws.addRow([]);
  bold(ws.addRow(["BILAN STOCK - SORTIE SUR INDEX - ÉCART SUR STOCK (PAR CUVE)"]));
  bold(ws.addRow(["Stations", "Cuves", ...TANK_HEADERS]));
  const all: TankLine[] = [];
  n.stations.forEach((s) => s.tanks.forEach((t, i) => { all.push(t); ws.addRow([i === 0 ? s.name : "", t.name, ...tankCells(t)]); }));
  const tot = fuelTotals(all);
  bold(ws.addRow(["TOTAL GÉNÉRAL", "SUPER", ...tankCells(tot.super)]));
  bold(ws.addRow(["", "GASOIL", ...tankCells(tot.gasoil)]));
  ws.addRow([]);
  bold(ws.addRow(["POINT DES VENTES SUR LA PÉRIODE DE CONTRÔLE"]));
  bold(ws.addRow(["Stations", ...SALE_HEADERS]));
  n.stations.forEach((s) => ws.addRow([s.name, ...saleCells(s.sales)]));
  const sum = (k: keyof PeriodSales) => n.stations.reduce((t, s) => t + (Number(s.sales[k]) || 0), 0);
  bold(ws.addRow(["TOTAL", ...(["montant", "bonsSociete", "bonsClients", "tickets", "cartes", "venteReelle", "momo", "liquidite", "versementBanque", "ecart"] as (keyof PeriodSales)[]).map(sum)]));
  ws.addRow([]);
  bold(ws.addRow(SIGNATAIRES));
  ws.columns.forEach((c, i) => { c.width = i < 2 ? 26 : 16; c.numFmt = "#,##0.00"; });
  await download(wb, `Bilan_controle_stations_${n.prevControl}_au_${n.control}.xlsx`);
}

/* ---------------- PDF ---------------- */

type Doc = InstanceType<typeof jsPDF>;
interface Col { label: string; w: number; right?: boolean }

function table(doc: Doc, y: number, cols: Col[], rows: { cells: string[]; bold?: boolean }[], x0 = 10): number {
  const H = doc.internal.pageSize.getHeight();
  const rowH = 5.2;
  const head = () => {
    doc.setFillColor(31, 41, 55); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    let x = x0;
    const total = cols.reduce((s, c) => s + c.w, 0);
    doc.rect(x0, y, total, rowH + 1, "F");
    cols.forEach((c) => { doc.text(c.label, c.right ? x + c.w - 1.2 : x + 1.2, y + 4, { align: c.right ? "right" : "left", maxWidth: c.w - 2 }); x += c.w; });
    y += rowH + 1;
  };
  head();
  rows.forEach((r, i) => {
    if (y + rowH > H - 8) { doc.addPage(); y = 12; head(); }
    const total = cols.reduce((s, c) => s + c.w, 0);
    if (r.bold) doc.setFillColor(254, 215, 170); else doc.setFillColor(i % 2 ? 255 : 248, i % 2 ? 255 : 249, i % 2 ? 255 : 250);
    doc.rect(x0, y, total, rowH, "F");
    doc.setDrawColor(220, 220, 220); doc.rect(x0, y, total, rowH);
    doc.setTextColor(31, 41, 55); doc.setFont("helvetica", r.bold ? "bold" : "normal"); doc.setFontSize(7);
    let x = x0;
    cols.forEach((c, j) => { doc.text(r.cells[j] ?? "", c.right ? x + c.w - 1.2 : x + 1.2, y + 3.7, { align: c.right ? "right" : "left", maxWidth: c.w - 2 }); x += c.w; });
    y += rowH;
  });
  return y + 3;
}

function section(doc: Doc, y: number, title: string, need = 20): number {
  if (y + need > doc.internal.pageSize.getHeight() - 8) { doc.addPage(); y = 12; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(31, 41, 55);
  doc.text(title, 10, y + 4);
  return y + 6;
}

function signatures(doc: Doc, y: number, labels: string[]) {
  const W = doc.internal.pageSize.getWidth();
  if (y + 24 > doc.internal.pageSize.getHeight() - 8) { doc.addPage(); y = 12; }
  const w = (W - 20) / labels.length;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  labels.forEach((l, i) => {
    doc.text(l, 10 + i * w + w / 2, y + 5, { align: "center" });
    doc.setDrawColor(150, 150, 150); doc.line(10 + i * w + 6, y + 20, 10 + (i + 1) * w - 6, y + 20);
  });
}

const tankCols = (first: Col[]): Col[] => [...first, ...TANK_HEADERS.map((label) => ({ label, w: 26, right: true }))];
const saleCols = (first: Col): Col[] => [first, ...SALE_HEADERS.map((label) => ({ label, w: 24.5, right: true }))];
const fmtTank = (t: Parameters<typeof tankCells>[0]) => tankCells(t).map((v, i) => (i === 6 ? n0(v) : n2(v)));

export function exportStationPdf(s: StationClosing) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(31, 41, 55);
  headerLines(s).forEach((l, i) => { doc.setFontSize(i === 0 ? 12 : 8.5); doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.text(l, 10, y + 4); y += i === 0 ? 6.5 : 4.5; });
  if (s.missing.length) { doc.setTextColor(180, 83, 9); doc.setFontSize(8); doc.text(`${s.missing.length} jour(s) sans saisie retenue sur la période.`, 10, y + 4); y += 5; }
  y += 2;

  y = section(doc, y, "A. LIVRAISON DE PRODUITS SUR LA STATION (volume BL)");
  const tw = Math.min(30, 190 / Math.max(1, s.tanks.length));
  y = table(doc, y, [{ label: "Mois", w: 30 }, { label: "Période", w: 45 }, { label: "Nbre de BL", w: 20, right: true }, ...s.tanks.map((t) => ({ label: t.name, w: tw, right: true }))], [
    ...s.tanks.map((t) => ({ cells: [dateFr(addOne(s.prevControl)), `Stock ${t.name}`, "", ...s.tanks.map((x) => (x.tankId === t.tankId ? n0(t.stockInitial) : ""))] })),
    ...s.deliveries.rows.map((m) => ({ cells: [m.label, `${dateFr(m.from)} – ${dateFr(m.to)}`, String(m.nbBl), ...s.tanks.map((t) => n0(m.byTank[t.tankId] ?? 0))] })),
    { cells: ["TOTAL DES CHARGEMENTS", "", String(s.deliveries.total.nbBl), ...s.tanks.map((t) => n0(s.deliveries.total.byTank[t.tankId] ?? 0))], bold: true },
  ]);

  y = section(doc, y, "B. VALORISATION DU STOCK ET DES CHARGEMENTS");
  y = table(doc, y, [{ label: "Poste", w: 70 }, { label: "Qté", w: 30, right: true }, { label: "PU", w: 20, right: true }, { label: "Montant", w: 40, right: true }], [
    ...s.valuation.lines.map((l) => ({ cells: [l.label, n2(l.qty), n0(l.pu), n0(l.montant)] })),
    { cells: ["Total approvisionnement valorisé", "", "", n0(s.valuation.approvisionnement)], bold: true },
  ]);

  y = section(doc, y, "C. VENTES ET VERSEMENTS PÉRIODIQUES (FCFA)");
  y = table(doc, y, saleCols({ label: "Périodes", w: 30 }), [
    ...s.sales.rows.map((p) => ({ cells: [p.label, ...saleCells(p).map(n0)] })),
    { cells: ["TOTAL", ...saleCells(s.sales.total).map(n0)], bold: true },
  ]);

  y = section(doc, y, "D. TRAITEMENT DES INDEX ET SORTIES DE LA PÉRIODE");
  y = table(doc, y, [{ label: "Pompes", w: 40 }, ...["Index arrivée", "Index départ", "Sorties", "Retour cuve", "Sortie réelle", "PU", "Montant"].map((label) => ({ label, w: 30, right: true }))], [
    ...s.pumps.map((p) => {
      const pu = p.fuel === "super" ? s.prices.super : p.fuel === "gasoil" ? s.prices.gasoil : 0;
      return { cells: [`${p.name} (${fuelLabel(p.fuel)})`, n2(p.indexFin), n2(p.indexDebut), n2(p.brut), n2(p.retour), n2(p.net), n0(pu), n0(p.net * pu)] };
    }),
    { cells: ["TOTAL DES VENTES SUR INDEX", "", "", "", "", "", "", n0(s.valuation.ventes)], bold: true },
  ]);

  y = section(doc, y, "E. DÉTERMINATION ET VALORISATION DES ÉCARTS SUR STOCK (litres)");
  y = table(doc, y, tankCols([{ label: "Cuves", w: 40 }]), [
    ...s.tanks.map((t) => ({ cells: [t.name, ...fmtTank(t)] })),
    { cells: ["Total écarts valorisés", "", "", "", "", "", "", n0(s.valuation.sommeEcartsValorises)], bold: true },
  ]);

  y = section(doc, y, "BALANCE (FCFA)", 36);
  y = table(doc, y, [{ label: "Poste", w: 60 }, { label: "Montant", w: 40, right: true }], [
    { cells: ["Approvisionnement valorisé", n0(s.valuation.approvisionnement)] },
    { cells: ["Ventes sur index", n0(s.valuation.ventes)] },
    { cells: ["Balance", n0(s.valuation.balance)], bold: true },
    { cells: ["Stock contrôle valorisé", n0(s.valuation.stockControle)] },
    { cells: ["Écart", n0(s.valuation.ecart)], bold: true },
  ]);
  signatures(doc, y, s.motif === "gerance" ? ["GÉRANT SORTANT", "GÉRANT ENTRANT", ...SIGNATAIRES] : ["GÉRANT", ...SIGNATAIRES]);
  doc.save(`Arrete_comptes_${safe(s.stationName)}_${s.prevControl}_au_${s.control}.pdf`);
}

export function exportNetworkPdf(n: NetworkClosing) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(31, 41, 55);
  doc.text(`BILAN DU CONTRÔLE DES STATIONS DU ${dateFr(addOne(n.prevControl))} AU ${dateFr(n.control)}`, 10, y + 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(n.includePending ? "Saisies validées + en attente" : "Saisies validées N+1", 10, y + 9);
  y += 13;
  y = section(doc, y, "BILAN STOCK - SORTIE SUR INDEX - ÉCART SUR STOCK (PAR CUVE)");
  const all: TankLine[] = [];
  const rows: { cells: string[]; bold?: boolean }[] = [];
  n.stations.forEach((s) => s.tanks.forEach((t, i) => { all.push(t); rows.push({ cells: [i === 0 ? s.name : "", t.name, ...fmtTank(t)] }); }));
  const tot = fuelTotals(all);
  rows.push({ cells: ["TOTAL GÉNÉRAL", "SUPER", ...fmtTank(tot.super)], bold: true }, { cells: ["", "GASOIL", ...fmtTank(tot.gasoil)], bold: true });
  y = table(doc, y, tankCols([{ label: "Stations", w: 45 }, { label: "Cuves", w: 32 }]), rows);
  y = section(doc, y, "POINT DES VENTES SUR LA PÉRIODE DE CONTRÔLE (FCFA)");
  const keys = ["montant", "bonsSociete", "bonsClients", "tickets", "cartes", "venteReelle", "momo", "liquidite", "versementBanque", "ecart"] as (keyof PeriodSales)[];
  y = table(doc, y, saleCols({ label: "Stations", w: 30 }), [
    ...n.stations.map((s) => ({ cells: [s.name, ...saleCells(s.sales).map(n0)] })),
    { cells: ["TOTAL", ...keys.map((k) => n0(n.stations.reduce((t, s) => t + (Number(s.sales[k]) || 0), 0)))], bold: true },
  ]);
  signatures(doc, y, SIGNATAIRES);
  doc.save(`Bilan_controle_stations_${n.prevControl}_au_${n.control}.pdf`);
}
