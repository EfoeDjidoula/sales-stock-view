/** Exports des récaps ECAP et des fiches d'inventaire (Excel calqué sur les modèles + PDF sur papier à en-tête). */
import ExcelJS from "exceljs";
import { jsPDF } from "@/lib/pdf";
import { dateFr, section, signatures, table, type Col, type Doc } from "@/lib/accountClosingExport";
import { interleaveFuels, type InventoryCash, type InventoryTankLine, type PumpRecap, type SalesLine, type VoucherRecap } from "@/lib/ecap";

export interface EcapSheet {
  kind: "hebdo" | "mensuel";
  stationName: string; gerant: string; from: string; to: string; includePending: boolean;
  pumps: PumpRecap; rows: SalesLine[]; total: SalesLine; vouchers: VoucherRecap; missing: string[];
}
export interface InventorySheet {
  stationName: string; from: string; to: string; heureDe: string; heureA: string; gerant: string;
  controleurs: string[]; observation: string; includePending: boolean;
  pumps: PumpRecap; tanks: InventoryTankLine[]; cash: InventoryCash; venteSaisie: number; missing: string[];
}

const n0 = (v: number) => (Number(v) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const n2 = (v: number) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_");
const fuelName = (f: string) => (f === "super" ? "SUPER" : f === "gasoil" ? "GASOIL" : "AUTRE");
const pending = (b: boolean) => (b ? "Saisies validées N+1 + en attente" : "Saisies validées N+1 uniquement");

export const ECAP_TITLES = { hebdo: "RÉCAPITULATIF HEBDOMADAIRE DES VENTES DES STATIONS", mensuel: "RÉCAPITULATIF MENSUEL DES VENTES DES STATIONS" } as const;
export const SALES_HEADERS = ["Vente", "Bons société", "Bons clients", "Tickets valeur", "Cartes", "MoMo Pay", "À verser", "Vers. banque", "Écart"];
export const salesCells = (l: SalesLine) => [l.vente, l.bonsSociete, l.bonsClients, l.tickets, l.cartes, l.momo, l.aVerser, l.versementBanque, l.ecart];
export const ECAP_SIGNATURES = ["VISA ET NOM DU GÉRANT", "LE VÉRIFICATEUR", "LE DIRECTEUR EXPLOITATION"];
export const INVENTORY_SIGNATURES = ["VISA ET NOM DU GÉRANT", "CONTRÔLEUR 1", "CONTRÔLEUR 2", "CONTRÔLEUR 3", "LE DIRECTEUR EXPLOITATION"];
export const TANK_INV_HEADERS = ["Départ", "Dépotage (BL)", "Sorties index", "Théorique", "Jauge du jour", "Sortie sur cuve", "Écart sur stock"];
export const tankInvCells = (t: InventoryTankLine) => [t.depart, t.depotage, t.sortieIndex, t.theorique, t.jauge, t.sortieCuve, t.ecart];
export const CASH_HEADERS = ["Montant", "Bons société", "Bons clients", "Cartes", "Tickets valeur", "MoMo Pay", "Liquidité vendue", "Espèces comptées", "Écart"];
export const cashCells = (c: InventoryCash) => [c.montant, c.bonsSociete, c.bonsClients, c.cartes, c.tickets, c.momo, c.liquidite, c.especes, c.ecart];

/** Lignes pistolets + sous-totaux par carburant (cumul, PU, montant). */
function pumpRows(p: PumpRecap) {
  const out: { cells: (string | number)[]; bold?: boolean }[] = [];
  (["super", "gasoil"] as const).forEach((f) => {
    const ls = p.lines.filter((l) => l.fuel === f);
    if (!ls.length) return;
    ls.forEach((l) => out.push({ cells: [l.name, l.indexArrivee, l.indexDepart, l.sortie, l.retour, l.net, "", l.montant] }));
    const r = p.fuels[f];
    out.push({ cells: [`CUMUL ${fuelName(f)}`, "", "", "", "", r.cumul, r.puVariable ? `${n0(r.pu)} (moy.)` : r.pu, r.montant], bold: true });
  });
  out.push({ cells: ["TOTAL", "", "", "", "", "", "", p.totalMontant], bold: true });
  return out;
}
const PUMP_HEADERS = ["Pompes", "Index arrivée", "Index départ", "Sortie", "Ret. cuve", "Sortie réelle", "PU", "Montant"];
const fmtPump = (c: (string | number)[]) => c.map((v, i) => (typeof v === "string" ? v : i === 6 || i === 7 ? n0(v) : n2(v)));

export function ecapHeader(s: EcapSheet): string[] {
  return [ECAP_TITLES[s.kind], `SITE : ${s.stationName.toUpperCase()}`, `PÉRIODE DU ${dateFr(s.from)} AU ${dateFr(s.to)}   ·   ${pending(s.includePending)}`, `Gérant : ${s.gerant || "…………………………"}`];
}
export function inventoryHeader(s: InventorySheet): string[] {
  const date = s.from === s.to ? `DATE DE RELEVÉ DES DONNÉES : ${dateFr(s.to)}` : `RELEVÉ DES DONNÉES DU ${dateFr(s.from)} AU ${dateFr(s.to)}`;
  return [
    "FICHE DES DONNÉES D'INVENTAIRE PÉRIODIQUE DES STATIONS", `SITE : ${s.stationName.toUpperCase()}`,
    `${date}   ·   HEURE DE RELEVÉ : DE ${s.heureDe || "…H…"} À ${s.heureA || "…H…"}`,
    `Gérant : ${s.gerant || "…………………………"}   ·   ${pending(s.includePending)}`,
  ];
}

/* ---------------- Excel ---------------- */

const THIN = { style: "thin" as const, color: { argb: "FF9CA3AF" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function title(ws: ExcelJS.Worksheet, lines: string[], cols: number) {
  lines.forEach((l, i) => {
    const r = ws.addRow([l]);
    ws.mergeCells(r.number, 1, r.number, cols);
    r.getCell(1).alignment = { horizontal: "center" };
    r.font = { bold: i < 2, size: i === 0 ? 12 : 10 };
  });
  ws.addRow([]);
}
function grid(ws: ExcelJS.Worksheet, header: string[], rows: { cells: (string | number)[]; bold?: boolean }[], heading?: string) {
  if (heading) { const h = ws.addRow([heading]); h.font = { bold: true }; ws.mergeCells(h.number, 1, h.number, header.length); }
  const hr = ws.addRow(header);
  hr.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } }; c.border = BORDER; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
  rows.forEach((r) => {
    const row = ws.addRow(r.cells);
    for (let i = 1; i <= header.length; i++) {
      const c = row.getCell(i);
      c.border = BORDER;
      if (typeof c.value === "number") c.numFmt = "#,##0.00";
      if (r.bold) { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFED7AA" } }; }
    }
  });
  ws.addRow([]);
}
function signRow(ws: ExcelJS.Worksheet, labels: string[]) {
  ws.addRow([]);
  const r = ws.addRow(labels.flatMap((l) => [l, ""]));
  r.font = { bold: true };
}
async function download(wb: ExcelJS.Workbook, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
  a.download = name;
  a.click();
}
const sheetName = (wb: ExcelJS.Workbook, base: string) => {
  let n = base.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Station", i = 2;
  while (wb.getWorksheet(n)) n = `${n.slice(0, 25)} ${i++}`;
  return n;
};

function ecapWorksheet(wb: ExcelJS.Workbook, s: EcapSheet, company: string) {
  const ws = wb.addWorksheet(sheetName(wb, `${s.stationName} ${s.kind === "hebdo" ? "HEBDO" : "MENSUEL"}`));
  title(ws, [company, ...ecapHeader(s)], 10);
  grid(ws, PUMP_HEADERS, pumpRows(s.pumps));
  const first = s.kind === "hebdo" ? "Dates" : "Périodes";
  grid(ws, [first, ...SALES_HEADERS], [...s.rows.map((l) => ({ cells: [l.label, ...salesCells(l)] })), { cells: ["TOTAL", ...salesCells(s.total)], bold: true }],
    s.kind === "hebdo" ? "DÉTAIL DES VENTES JOURNALIÈRES" : "DÉTAIL DES VENTES HEBDOMADAIRES DE LA STATION");
  if (s.kind === "hebdo") {
    grid(ws, ["Libellés", "Montants"], [
      ...s.vouchers.lines.map((l) => ({ cells: [l.label, l.montant] })),
      { cells: ["TOTAL DES BONS + TICKETS VALEUR + CARTES + MOMO PAY", s.vouchers.totalDeductions], bold: true },
      { cells: ["VERSEMENT BANQUE", s.vouchers.versementBanque] },
      { cells: ["TOTAL", s.vouchers.total], bold: true },
      { cells: ["VENTE DE LA PÉRIODE", s.vouchers.vente] },
      { cells: ["ÉCART (TOTAL − VENTE)", s.vouchers.ecart], bold: true },
    ], "RÉCAPITULATIF DES BONS, TICKETS VALEUR, CARTES ET MOMO PAY");
  }
  signRow(ws, ECAP_SIGNATURES);
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 34 : 15; });
}

export async function exportEcapXlsx(sheets: EcapSheet[], company: string) {
  if (!sheets.length) return;
  const wb = new ExcelJS.Workbook();
  sheets.forEach((s) => ecapWorksheet(wb, s, company));
  const s = sheets[0];
  const who = sheets.length > 1 ? "toutes_stations" : safe(s.stationName);
  await download(wb, `ECAP_${s.kind}_${who}_${s.from}_au_${s.to}.xlsx`);
}

export async function exportInventoryXlsx(s: InventorySheet, company: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName(wb, s.stationName));
  title(ws, [company, ...inventoryHeader(s)], 13);
  grid(ws, PUMP_HEADERS.slice(0, 6), pumpRows(s.pumps).filter((r) => r.cells[0] !== "TOTAL").map((r) => ({ ...r, cells: r.cells.slice(0, 6) })), "PARTIE 1 — RELEVÉ DES DONNÉES SUR POMPES");
  grid(ws, ["Cuves", ...TANK_INV_HEADERS], s.tanks.map((t) => ({ cells: [t.name, ...tankInvCells(t)] })), "PARTIE 2 — RELEVÉ DES DONNÉES SUR CUVES");
  grid(ws, ["Pompes", "Sorties réelles", "PU", "Montant"], [
    ...interleaveFuels(s.pumps.lines).map((l) => ({ cells: [l.name, l.net, l.net ? Math.round(l.montant / l.net) : 0, l.montant] })),
    { cells: ["CUMUL MONTANT", "", "", s.pumps.totalMontant], bold: true },
  ], "PARTIE 3 — VENTES, BONS ET MONÉTIQUE");
  grid(ws, CASH_HEADERS, [{ cells: cashCells(s.cash), bold: true }]);
  signRow(ws, INVENTORY_SIGNATURES);
  ws.addRow([]);
  ws.addRow(["OBSERVATION", s.observation]).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 30 : 15; });
  await download(wb, `Fiche_inventaire_${safe(s.stationName)}_${s.from}_au_${s.to}.xlsx`);
}

/* ---------------- PDF ---------------- */

function headerBlock(doc: Doc, lines: string[], warn?: string): number {
  let y = 10;
  doc.setTextColor(31, 41, 55);
  lines.forEach((l, i) => { doc.setFont("helvetica", i < 2 ? "bold" : "normal"); doc.setFontSize(i === 0 ? 11 : 8.5); doc.text(l, 10, y + 4); y += i === 0 ? 6 : 4.5; });
  if (warn) { doc.setTextColor(180, 83, 9); doc.setFontSize(8); doc.text(warn, 10, y + 4); y += 5; doc.setTextColor(31, 41, 55); }
  return y + 2;
}
const missingNote = (m: string[]) => (m.length ? `${m.length} jour(s) sans saisie retenue sur la période.` : undefined);

function drawEcap(doc: Doc, s: EcapSheet) {
  let y = headerBlock(doc, ecapHeader(s), missingNote(s.missing));
  const pc: Col[] = [{ label: "Pompes", w: 30 }, ...[22, 22, 20, 18, 22].map((w, i) => ({ label: PUMP_HEADERS[i + 1], w, right: true })), { label: "PU", w: 22, right: true }, { label: "Montant", w: 34, right: true }];
  y = table(doc, y, pc, pumpRows(s.pumps).map((r) => ({ cells: fmtPump(r.cells), bold: r.bold })));
  y = section(doc, y, s.kind === "hebdo" ? "DÉTAIL DES VENTES JOURNALIÈRES (FCFA)" : "DÉTAIL DES VENTES HEBDOMADAIRES DE LA STATION (FCFA)");
  const sc: Col[] = [{ label: s.kind === "hebdo" ? "Dates" : "Périodes", w: 22 }, ...SALES_HEADERS.map((label) => ({ label, w: 18.66, right: true }))];
  y = table(doc, y, sc, [
    ...s.rows.map((l) => ({ cells: [l.label, ...(l.jours ? salesCells(l).map(n0) : SALES_HEADERS.map(() => "—"))] })),
    { cells: ["TOTAL", ...salesCells(s.total).map(n0)], bold: true },
  ]);
  if (s.kind === "hebdo") {
    y = section(doc, y, "RÉCAPITULATIF DES BONS, TICKETS VALEUR, CARTES ET MOMO PAY (FCFA)", 44);
    y = table(doc, y, [{ label: "Libellés", w: 110 }, { label: "Montants", w: 40, right: true }], [
      ...s.vouchers.lines.map((l) => ({ cells: [l.label, n0(l.montant)] })),
      { cells: ["TOTAL BONS + TICKETS VALEUR + CARTES + MOMO PAY", n0(s.vouchers.totalDeductions)], bold: true },
      { cells: ["VERSEMENT BANQUE", n0(s.vouchers.versementBanque)] },
      { cells: ["TOTAL", n0(s.vouchers.total)], bold: true },
      { cells: ["VENTE DE LA PÉRIODE", n0(s.vouchers.vente)] },
      { cells: ["ÉCART (TOTAL − VENTE)", n0(s.vouchers.ecart)], bold: true },
    ]);
  }
  signatures(doc, y + 2, ECAP_SIGNATURES);
}

export function exportEcapPdf(sheets: EcapSheet[]) {
  if (!sheets.length) return;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  sheets.forEach((s, i) => { if (i) doc.addPage(); drawEcap(doc, s); });
  const s = sheets[0];
  doc.save(`ECAP_${s.kind}_${sheets.length > 1 ? "toutes_stations" : safe(s.stationName)}_${s.from}_au_${s.to}.pdf`);
}

export function exportInventoryPdf(s: InventorySheet) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = headerBlock(doc, inventoryHeader(s), missingNote(s.missing));
  y = section(doc, y, "PARTIE 1 — RELEVÉ DES DONNÉES SUR POMPES");
  y = table(doc, y, [{ label: "Pompes", w: 40 }, ...PUMP_HEADERS.slice(1, 6).map((label) => ({ label, w: 32, right: true }))],
    pumpRows(s.pumps).filter((r) => r.cells[0] !== "TOTAL").map((r) => ({ cells: fmtPump(r.cells.slice(0, 6)), bold: r.bold })));
  y = section(doc, y, "PARTIE 2 — RELEVÉ DES DONNÉES SUR CUVES (litres)");
  y = table(doc, y, [{ label: "Cuves", w: 48 }, ...TANK_INV_HEADERS.map((label) => ({ label, w: 32, right: true }))],
    s.tanks.map((t) => ({ cells: [t.name, ...tankInvCells(t).map(n2)] })));
  y = section(doc, y, "PARTIE 3 — VENTES, BONS ET MONÉTIQUE (FCFA)", 40);
  y = table(doc, y, [{ label: "Pompes", w: 40 }, { label: "Sorties réelles", w: 32, right: true }, { label: "PU", w: 22, right: true }, { label: "Montant", w: 36, right: true }], [
    ...interleaveFuels(s.pumps.lines).map((l) => ({ cells: [l.name, n2(l.net), n0(l.net ? l.montant / l.net : 0), n0(l.montant)] })),
    { cells: ["CUMUL MONTANT", "", "", n0(s.pumps.totalMontant)], bold: true },
  ]);
  y = section(doc, y, "CAISSE — LIQUIDITÉ VENDUE ET ESPÈCES COMPTÉES (FCFA)", 62);
  y = table(doc, y, CASH_HEADERS.map((label) => ({ label, w: 30, right: true })), [{ cells: cashCells(s.cash).map(n0), bold: true }]);
  if (s.controleurs.some(Boolean)) { doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text(`Contrôleurs : ${s.controleurs.filter(Boolean).join(" · ")}`, 10, y + 3); y += 6; }
  signatures(doc, y, INVENTORY_SIGNATURES);
  y += 26;
  if (y + 14 > doc.internal.pageSize.getHeight() - 8) { doc.addPage(); y = 12; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("OBSERVATION :", 10, y + 4);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(s.observation || "", 240), 36, y + 4);
  doc.save(`Fiche_inventaire_${safe(s.stationName)}_${s.from}_au_${s.to}.pdf`);
}

/* ---------------- Bilan des ventes réseau ---------------- */
import { NETWORK_HEADERS, networkCells, type NetworkRow } from "@/lib/networkSales";

const networkTitle = (from: string, to: string, inc: boolean) => [
  from === to ? `BILAN DES VENTES ET ENCAISSEMENTS DU ${dateFr(from)}` : `BILAN DES VENTES ET ENCAISSEMENTS DU ${dateFr(from)} AU ${dateFr(to)}`,
  `RÉSEAU DES STATIONS   ·   ${pending(inc)}`,
];

export async function exportNetworkXlsx(rows: NetworkRow[], total: NetworkRow, from: string, to: string, inc: boolean, company: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bilan réseau");
  title(ws, [company, ...networkTitle(from, to, inc)], NETWORK_HEADERS.length);
  grid(ws, NETWORK_HEADERS, [...rows.map((x) => ({ cells: networkCells(x) })), { cells: networkCells(total), bold: true }]);
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 24 : i === 11 ? 20 : 15; });
  await download(wb, `Bilan_ventes_reseau_${from}_au_${to}.xlsx`);
}

export function exportNetworkPdf(rows: NetworkRow[], total: NetworkRow, from: string, to: string, inc: boolean) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const y = headerBlock(doc, networkTitle(from, to, inc));
  const cols: Col[] = NETWORK_HEADERS.map((label, i) => ({ label, w: i === 0 ? 30 : i === 11 ? 27 : 22, right: i > 0 && i < 11 }));
  const fmt = (x: NetworkRow) => networkCells(x).map((v) => (typeof v === "number" ? n0(v) : v));
  const end = table(doc, y, cols, [...rows.map((x) => ({ cells: fmt(x) })), { cells: fmt(total), bold: true }]);
  signatures(doc, end + 2, ["LE CONTRÔLEUR", "LE DIRECTEUR EXPLOITATION"]);
  doc.save(`Bilan_ventes_reseau_${from}_au_${to}.pdf`);
}
