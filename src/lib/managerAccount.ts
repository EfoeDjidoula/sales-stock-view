/**
 * Compte des gérants — calculs purs (aucun accès base), à partir de données déjà scoupées.
 *
 * Bilan matières par carburant, sur une station et une plage de dates :
 *   Stock initial      = Σ stock d'ouverture des cuves au premier jour saisi de la période
 *   Réceptions         = Σ quantités réceptionnées en cuve (réceptions logistiques validées)
 *   Total disponible   = Stock initial + Réceptions
 *   Ventes             = Σ sorties nettes aux pistolets (index arrivée − index départ − retour en cuve)
 *   Stock théorique    = Total disponible − Ventes
 *   Stock physique     = Σ jauges des cuves au dernier jour saisi de la période
 *   Écart              = Stock physique − Stock théorique (négatif = manquant)
 *   Écart %            = Écart / Ventes × 100, comparé au seuil de tolérance saisi par l'utilisateur
 *
 * Les trois niveaux de stock amont restent séparés : commandé (qty_approved),
 * enlevé au dépôt (qty_loaded, quantité facturée du BL) et réceptionné en cuve (qty_received).
 * Seul le réceptionné entre dans le bilan matières.
 */
import { nozzleOutput, num } from "@/lib/indexModel";

export type Fuel = "super" | "gasoil";
export const FUELS: Fuel[] = ["super", "gasoil"];

export interface TankReadingRow {
  entry_date: string;
  tank_id: string;
  product_type: string;
  stock_ouverture: number | null;
  depotage: number | null;
  sortie: number | null;
  jauge: number | null;
  ecart: number | null;
}

export interface PumpRow {
  entry_date: string;
  pump_id: string;
  product_type: string;
  index_depart: number | null;
  index_arrivee: number | null;
  retour_cuve: number | null;
}

export interface ReceptionRow {
  date: string;
  fuel: Fuel | "other";
  reference?: string | null;
  bl_number?: string | null;
  qty_approved: number | null;
  qty_loaded: number | null;
  qty_delivered: number | null;
  qty_received: number | null;
}

export interface EntryRow {
  entry_date: string;
  status: string;
  vente_globale: number | null;
  autoconso_montant: number | null;
  bons_clients_montant: number | null;
  tickets_valeur_montant: number | null;
  cartes_montant: number | null;
  versement_momo: number | null;
  montant_a_verser: number | null;
  versement_banque: number | null;
  ecart_versement: number | null;
}

export const fuelOf = (t: string | null | undefined): Fuel | "other" => {
  const s = (t ?? "").toLowerCase();
  if (s.includes("gas") || s.includes("diesel")) return "gasoil";
  if (s.includes("sup") || s.includes("ess")) return "super";
  return "other";
};

export type Verdict = "ok" | "manquant" | "excedent" | "na";

/** Qualifie un écart (en % des ventes) par rapport au seuil de tolérance (en %, valeur absolue). */
export const classifyVariance = (pct: number | null, tolerancePct: number): Verdict => {
  if (pct == null || !Number.isFinite(pct)) return "na";
  const tol = Math.abs(tolerancePct);
  if (Math.abs(pct) <= tol + 1e-9) return "ok";
  return pct < 0 ? "manquant" : "excedent";
};

export interface StockBalance {
  stockInitial: number;
  receptions: number;
  totalDisponible: number;
  ventes: number;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  ecartPct: number | null;
  verdict: Verdict;
  /** Dépotages déclarés dans les saisies d'index (contrôle croisé avec les réceptions). */
  depotagesSaisis: number;
  /** Amont : commandé, enlevé (facturé BL), livré déclaré, réceptionné. */
  commande: number;
  enleve: number;
  livreDeclare: number;
  ecartTransport: number;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Bilan matières d'un carburant. */
export function stockBalance(
  fuel: Fuel,
  readings: TankReadingRow[],
  pumps: PumpRow[],
  receptions: ReceptionRow[],
  tolerancePct: number,
): StockBalance {
  const r = readings.filter((x) => fuelOf(x.product_type) === fuel);
  const firstByTank = new Map<string, TankReadingRow>();
  const lastByTank = new Map<string, TankReadingRow>();
  for (const x of r) {
    const f = firstByTank.get(x.tank_id);
    if (!f || x.entry_date < f.entry_date) firstByTank.set(x.tank_id, x);
    const l = lastByTank.get(x.tank_id);
    if (!l || x.entry_date > l.entry_date) lastByTank.set(x.tank_id, x);
  }
  const stockInitial = [...firstByTank.values()].reduce((s, x) => s + num(x.stock_ouverture), 0);
  const stockPhysique = [...lastByTank.values()].reduce((s, x) => s + num(x.jauge), 0);
  const depotagesSaisis = r.reduce((s, x) => s + num(x.depotage), 0);

  const rec = receptions.filter((x) => x.fuel === fuel);
  const receptionsQty = rec.reduce((s, x) => s + num(x.qty_received), 0);
  const commande = rec.reduce((s, x) => s + num(x.qty_approved), 0);
  const enleve = rec.reduce((s, x) => s + num(x.qty_loaded), 0);
  const livreDeclare = rec.reduce((s, x) => s + num(x.qty_delivered), 0);

  const ventes = pumps
    .filter((p) => fuelOf(p.product_type) === fuel)
    .reduce((s, p) => s + nozzleOutput(num(p.index_depart), num(p.index_arrivee), num(p.retour_cuve)).net, 0);

  const totalDisponible = stockInitial + receptionsQty;
  const stockTheorique = totalDisponible - ventes;
  const ecart = stockPhysique - stockTheorique;
  const ecartPct = ventes > 0 ? (ecart / ventes) * 100 : null;
  return {
    stockInitial: round(stockInitial),
    receptions: round(receptionsQty),
    totalDisponible: round(totalDisponible),
    ventes: round(ventes),
    stockTheorique: round(stockTheorique),
    stockPhysique: round(stockPhysique),
    ecart: round(ecart),
    ecartPct: ecartPct == null ? null : round(ecartPct, 3),
    verdict: classifyVariance(ecartPct, tolerancePct),
    depotagesSaisis: round(depotagesSaisis),
    commande: round(commande),
    enleve: round(enleve),
    livreDeclare: round(livreDeclare),
    ecartTransport: round(receptionsQty - enleve),
  };
}

export interface PumpSummary {
  pump_id: string;
  fuel: Fuel | "other";
  indexDebut: number;
  indexFin: number;
  brut: number;
  retour: number;
  net: number;
  jours: number;
}

/** Index de début (premier jour) et de fin (dernier jour) par pompe, avec cumul des sorties. */
export function pumpSummaries(pumps: PumpRow[]): PumpSummary[] {
  const by = new Map<string, PumpRow[]>();
  pumps.forEach((p) => by.set(p.pump_id, [...(by.get(p.pump_id) ?? []), p]));
  return [...by.entries()].map(([pump_id, rows]) => {
    const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    let brut = 0, retour = 0, net = 0;
    for (const p of sorted) {
      const o = nozzleOutput(num(p.index_depart), num(p.index_arrivee), num(p.retour_cuve));
      brut += o.brut; retour += o.retour; net += o.net;
    }
    return {
      pump_id,
      fuel: fuelOf(sorted[0].product_type),
      indexDebut: num(sorted[0].index_depart),
      indexFin: num(sorted[sorted.length - 1].index_arrivee),
      brut: round(brut), retour: round(retour), net: round(net),
      jours: sorted.length,
    };
  });
}

export interface DayRow {
  date: string;
  status: string | null;
  ventes: Record<Fuel, number>;
  depotages: Record<Fuel, number>;
  jauge: Record<Fuel, number>;
  ecart: Record<Fuel, number>;
}

/** Détail jour par jour (ventes nettes, dépotages, jauges et écarts journaliers des cuves). */
export function dailyRows(entries: EntryRow[], readings: TankReadingRow[], pumps: PumpRow[]): DayRow[] {
  const z = () => ({ super: 0, gasoil: 0 });
  const days = new Map<string, DayRow>();
  const get = (d: string) => {
    let row = days.get(d);
    if (!row) { row = { date: d, status: null, ventes: z(), depotages: z(), jauge: z(), ecart: z() }; days.set(d, row); }
    return row;
  };
  entries.forEach((e) => { get(e.entry_date).status = e.status; });
  for (const x of readings) {
    const f = fuelOf(x.product_type); if (f === "other") continue;
    const row = get(x.entry_date);
    row.depotages[f] += num(x.depotage); row.jauge[f] += num(x.jauge); row.ecart[f] += num(x.ecart);
  }
  for (const p of pumps) {
    const f = fuelOf(p.product_type); if (f === "other") continue;
    get(p.entry_date).ventes[f] += nozzleOutput(num(p.index_depart), num(p.index_arrivee), num(p.retour_cuve)).net;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface FinancialBalance {
  venteGlobale: number;
  autoconso: number;
  bonsClients: number;
  tickets: number;
  cartes: number;
  momo: number;
  totalDeductions: number;
  montantAVerser: number;
  versementBanque: number;
  ecartVersement: number;
}

/** Bilan financier : cumul des montants calculés côté serveur sur chaque saisie. */
export function financialBalance(entries: EntryRow[]): FinancialBalance {
  const s = (k: keyof EntryRow) => round(entries.reduce((t, e) => t + num(e[k] as number | null), 0));
  const autoconso = s("autoconso_montant"), bonsClients = s("bons_clients_montant"), tickets = s("tickets_valeur_montant");
  const cartes = s("cartes_montant"), momo = s("versement_momo");
  const montantAVerser = s("montant_a_verser"), versementBanque = s("versement_banque");
  return {
    venteGlobale: s("vente_globale"), autoconso, bonsClients, tickets, cartes, momo,
    totalDeductions: round(autoconso + bonsClients + tickets + cartes + momo),
    montantAVerser, versementBanque,
    ecartVersement: round(versementBanque - montantAVerser),
  };
}

/** Jours de la période sans saisie retenue (pour signaler un bilan incomplet). */
export function missingDays(from: string, to: string, entries: { entry_date: string }[]): string[] {
  const have = new Set(entries.map((e) => e.entry_date));
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  while (d <= end && out.length < 400) {
    const k = d.toISOString().slice(0, 10);
    if (!have.has(k)) out.push(k);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
