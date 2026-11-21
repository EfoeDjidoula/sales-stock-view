/**
 * Récaps ECAP (hebdomadaire / mensuel) et fiches d'inventaire — calculs purs, données déjà scoupées.
 *
 * Pistolet : sortie = Σ(index arrivée − index départ) ; sortie réelle = sortie − retour en cuve ;
 *            montant = Σ sorties réelles du jour × prix du jour (structure de prix en vigueur).
 * Ventes   : à verser = vente du jour − (bons société + bons clients + tickets valeur + cartes + MoMo) ;
 *            écart = versement banque − à verser (négatif = manquant).
 * Cuve     : théorique = départ + dépotages (BL) − sorties index ; sortie sur cuve = départ + dépotages − jauge ;
 *            écart sur stock = jauge − théorique (= sorties index − sortie sur cuve).
 * Caisse   : liquidité vendue = montant − bons − cartes − tickets − MoMo ; écart = espèces comptées − liquidité.
 */
import { nozzleOutput, num } from "@/lib/indexModel";
import { fuelOf, type Fuel } from "@/lib/managerAccount";
import { bookedQty, weeklyPeriods } from "@/lib/accountClosing";

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export interface PriceStructure { effective_date: string; super_price: number | null; gasoil_price: number | null }
export type PriceFn = (date: string, fuel: Fuel) => number;

/** Prix du jour : dernière structure active en vigueur à la date, sinon prix par défaut. */
export function priceResolver(structures: PriceStructure[], fallback: Record<Fuel, number>): PriceFn {
  const sorted = [...structures].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  return (date, fuel) => {
    let p = 0;
    for (const s of sorted) {
      if (s.effective_date.slice(0, 10) > date) break;
      const v = num(fuel === "super" ? s.super_price : s.gasoil_price);
      if (v > 0) p = v;
    }
    return p > 0 ? p : fallback[fuel];
  };
}

export interface PumpEntryRow {
  entry_date: string; pump_id: string; product_type: string;
  index_depart: number | null; index_arrivee: number | null; retour_cuve: number | null;
}
export interface PumpLine {
  pumpId: string; name: string; fuel: Fuel | "other";
  indexArrivee: number; indexDepart: number; sortie: number; retour: number; net: number; montant: number; jours: number;
}
export interface FuelRecap { cumul: number; montant: number; pu: number; puVariable: boolean }
export interface PumpRecap { lines: PumpLine[]; fuels: Record<Fuel, FuelRecap>; totalMontant: number }

const rank = (f: string) => (f === "super" ? 0 : f === "gasoil" ? 1 : 2);

/** Index de départ (premier jour), d'arrivée (dernier jour), sorties cumulées et montant par pistolet. */
export function pumpRecap(rows: PumpEntryRow[], names: Map<string, string>, price: PriceFn): PumpRecap {
  const by = new Map<string, PumpEntryRow[]>();
  rows.forEach((r) => by.set(r.pump_id, [...(by.get(r.pump_id) ?? []), r]));
  const prices: Record<Fuel, Set<number>> = { super: new Set(), gasoil: new Set() };
  const lines: PumpLine[] = [...by.entries()].map(([pumpId, rs]) => {
    const sorted = [...rs].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const fuel = fuelOf(sorted[0].product_type);
    let sortie = 0, retour = 0, net = 0, montant = 0;
    for (const r of sorted) {
      const o = nozzleOutput(num(r.index_depart), num(r.index_arrivee), num(r.retour_cuve));
      sortie += o.brut; retour += o.retour; net += o.net;
      if (fuel !== "other") { const pu = price(r.entry_date, fuel); prices[fuel].add(pu); montant += o.net * pu; }
    }
    return {
      pumpId, name: names.get(pumpId) ?? "Pompe", fuel,
      indexArrivee: num(sorted[sorted.length - 1].index_arrivee), indexDepart: num(sorted[0].index_depart),
      sortie: round(sortie), retour: round(retour), net: round(net), montant: round(montant), jours: sorted.length,
    };
  }).sort((a, b) => rank(a.fuel) - rank(b.fuel) || a.name.localeCompare(b.name, "fr", { numeric: true }));
  const fuelRecap = (f: Fuel): FuelRecap => {
    const ls = lines.filter((l) => l.fuel === f);
    const cumul = round(ls.reduce((s, l) => s + l.net, 0));
    const montant = round(ls.reduce((s, l) => s + l.montant, 0));
    const variable = prices[f].size > 1;
    return { cumul, montant, pu: variable ? (cumul ? round(montant / cumul) : 0) : ([...prices[f]][0] ?? 0), puVariable: variable };
  };
  const fuels = { super: fuelRecap("super"), gasoil: fuelRecap("gasoil") };
  return { lines, fuels, totalMontant: round(fuels.super.montant + fuels.gasoil.montant) };
}

/** Ordre « Super 1, Gasoil 1, Super 2, Gasoil 2 … » des fiches d'inventaire (partie 3). */
export function interleaveFuels<T extends { fuel: string }>(lines: T[]): T[] {
  const s = lines.filter((l) => l.fuel === "super"), g = lines.filter((l) => l.fuel === "gasoil"), o = lines.filter((l) => l.fuel !== "super" && l.fuel !== "gasoil");
  const out: T[] = [];
  for (let i = 0; i < Math.max(s.length, g.length); i++) { if (s[i]) out.push(s[i]); if (g[i]) out.push(g[i]); }
  return [...out, ...o];
}

export interface SalesEntry {
  entry_date: string;
  vente_globale: number | null; autoconso_montant: number | null; bons_clients_montant: number | null;
  tickets_valeur_montant: number | null; cartes_montant: number | null; versement_momo: number | null; versement_banque: number | null;
}
export interface SalesLine {
  label: string; from: string; to: string; jours: number;
  vente: number; bonsSociete: number; bonsClients: number; tickets: number; cartes: number; momo: number;
  aVerser: number; versementBanque: number; ecart: number;
}

export function salesLine(label: string, from: string, to: string, entries: SalesEntry[]): SalesLine {
  const es = entries.filter((e) => e.entry_date >= from && e.entry_date <= to);
  const s = (k: keyof SalesEntry) => round(es.reduce((t, e) => t + num(e[k] as number | null), 0));
  const vente = s("vente_globale"), bonsSociete = s("autoconso_montant"), bonsClients = s("bons_clients_montant");
  const tickets = s("tickets_valeur_montant"), cartes = s("cartes_montant"), momo = s("versement_momo"), versementBanque = s("versement_banque");
  const aVerser = round(vente - bonsSociete - bonsClients - tickets - cartes - momo);
  return { label, from, to, jours: es.length, vente, bonsSociete, bonsClients, tickets, cartes, momo, aVerser, versementBanque, ecart: round(versementBanque - aVerser) };
}

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Une ligne par jour de la période (jours sans saisie retenue : jours = 0). */
export function dailyLines(entries: SalesEntry[], from: string, to: string): SalesLine[] {
  const out: SalesLine[] = [];
  const d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  while (d <= end && out.length < 62) {
    const k = d.toISOString().slice(0, 10);
    out.push(salesLine(dmy(k), k, k, entries));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Une ligne par semaine (lundi–dimanche, coupée en fin de mois), comme le modèle mensuel. */
export const weeklyLines = (entries: SalesEntry[], from: string, to: string): SalesLine[] =>
  weeklyPeriods(from, to).map((p) => salesLine(p.label, p.from, p.to, entries));

export interface VoucherRecap {
  lines: { label: string; montant: number }[];
  totalDeductions: number; versementBanque: number; total: number; vente: number; ecart: number;
}

/** Récapitulatif des bons, tickets valeur, cartes et MoMo Pay, rapproché de la vente. */
export function voucherRecap(t: SalesLine): VoucherRecap {
  const lines = [
    { label: "Bons société (autoconsommation)", montant: t.bonsSociete },
    { label: "Bons clients", montant: t.bonsClients },
    { label: "Tickets valeur", montant: t.tickets },
    { label: "Cartes carburant", montant: t.cartes },
    { label: "MoMo Pay", montant: t.momo },
  ];
  const totalDeductions = round(lines.reduce((s, l) => s + l.montant, 0));
  const total = round(totalDeductions + t.versementBanque);
  return { lines, totalDeductions, versementBanque: t.versementBanque, total, vente: t.vente, ecart: round(total - t.vente) };
}

export interface InvTank { id: string; name: string; product_type: string | null }
export interface InvReading { entry_date: string; tank_id: string; stock_ouverture: number | null; depotage: number | null; sortie: number | null; jauge: number | null }
export interface InventoryTankLine {
  tankId: string; name: string; fuel: Fuel | "other";
  depart: number; depotage: number; sortieIndex: number; theorique: number; jauge: number; sortieCuve: number; ecart: number; jours: number;
}

export interface InvReception { date: string; tank_id: string | null; qty_loaded: number | null; qty_received: number | null }

/**
 * Relevé des cuves : départ (premier jour), dépotages et sorties cumulés, jauge du dernier jour.
 * Dépotages = réceptions validées au volume BL (règle de gestion) ; sans réceptions fournies, ceux des bilans de cuve.
 */
export function inventoryTanks(tanks: InvTank[], readings: InvReading[], receptions?: InvReception[]): InventoryTankLine[] {
  return [...tanks]
    .sort((a, b) => rank(fuelOf(a.product_type)) - rank(fuelOf(b.product_type)) || a.name.localeCompare(b.name, "fr", { numeric: true }))
    .map((t) => {
      const rs = readings.filter((r) => r.tank_id === t.id).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      const depart = rs.length ? num(rs[0].stock_ouverture) : 0;
      const jauge = rs.length ? num(rs[rs.length - 1].jauge) : 0;
      const depotage = receptions
        ? receptions.filter((r) => r.tank_id === t.id).reduce((s, r) => s + bookedQty(r), 0)
        : rs.reduce((s, r) => s + num(r.depotage), 0);
      const sortieIndex = rs.reduce((s, r) => s + num(r.sortie), 0);
      const theorique = depart + depotage - sortieIndex;
      return {
        tankId: t.id, name: t.name, fuel: fuelOf(t.product_type),
        depart: round(depart), depotage: round(depotage), sortieIndex: round(sortieIndex), theorique: round(theorique),
        jauge: round(jauge), sortieCuve: rs.length ? round(depart + depotage - jauge) : 0, ecart: rs.length ? round(jauge - theorique) : 0, jours: rs.length,
      };
    });
}

export interface InventoryCash {
  montant: number; bonsSociete: number; bonsClients: number; cartes: number; tickets: number; momo: number;
  liquidite: number; especes: number; ecart: number;
}

/** Partie 3 de la fiche : liquidité vendue (montant pistolets − bons − monétique) comparée aux espèces comptées. */
export function inventoryCash(montant: number, t: SalesLine, especes: number): InventoryCash {
  const liquidite = round(montant - t.bonsSociete - t.bonsClients - t.cartes - t.tickets - t.momo);
  return { montant: round(montant), bonsSociete: t.bonsSociete, bonsClients: t.bonsClients, cartes: t.cartes, tickets: t.tickets, momo: t.momo, liquidite, especes: round(especes), ecart: round(especes - liquidite) };
}

/** Semaine lundi–dimanche contenant la date. */
export function weekOf(date: string): { from: string; to: string } {
  const d = new Date(date + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from, to: d.toISOString().slice(0, 10) };
}

/** Premier et dernier jour du mois « AAAA-MM ». */
export function monthOf(ym: string): { from: string; to: string } {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}
