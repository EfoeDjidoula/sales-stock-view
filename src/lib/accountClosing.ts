/**
 * Arrêté des comptes — calculs purs (aucun accès base), à partir de données déjà scoupées.
 *
 * Période = lendemain du contrôle précédent → date du contrôle actuel.
 * Par cuve :
 *   Stock initial  = stock d'ouverture du premier jour retenu (= jauge du contrôle précédent)
 *   Approv.        = Σ dépotages au volume chargé (BL) des réceptions validées sur la cuve
 *   Sorties        = Σ sorties réelles des pistolets reliés à la cuve (index − retour en cuve)
 *   SF théorique   = Stock initial + Approv. − Sorties
 *   Écart          = Jauge au contrôle − SF théorique (négatif = manquant)
 *   Écart valorisé = Écart × PU du produit (prix retenu pour l'arrêté)
 * Balance financière :
 *   Approvisionnement valorisé = (Σ stocks initiaux + Σ approv.) × PU
 *   Balance        = Approvisionnement valorisé − Ventes sur index (montants du jour)
 *   Stock contrôle = Σ jauges × PU
 *   Écart          = Stock contrôle − Balance
 */
import { num } from "@/lib/indexModel";
import { fuelOf, type Fuel } from "@/lib/managerAccount";

export type Prices = Record<Fuel, number>;

export interface ClosingTank { id: string; name: string; product_type: string | null; station_id: string }
export interface ClosingReading {
  entry_date: string; station_id: string; tank_id: string;
  stock_ouverture: number | null; sortie: number | null; jauge: number | null;
}
export interface ClosingReception {
  date: string; station_id: string; tank_id: string | null;
  reference?: string | null; bl_number?: string | null;
  qty_loaded: number | null; qty_received: number | null;
}
export interface ClosingEntry {
  entry_date: string; station_id: string;
  vente_globale: number | null; autoconso_montant: number | null; bons_clients_montant: number | null;
  tickets_valeur_montant: number | null; cartes_montant: number | null; versement_momo: number | null;
  versement_banque: number | null;
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
/** Volume retenu pour une réception : BL chargé, sinon volume constaté. */
export const bookedQty = (r: Pick<ClosingReception, "qty_loaded" | "qty_received">) =>
  num(r.qty_loaded) > 0 ? num(r.qty_loaded) : num(r.qty_received);

const rank = (f: Fuel | "other") => (f === "super" ? 0 : f === "gasoil" ? 1 : 2);
export const sortTanks = <T extends { name: string; product_type: string | null }>(t: T[]) =>
  [...t].sort((a, b) => rank(fuelOf(a.product_type)) - rank(fuelOf(b.product_type)) || a.name.localeCompare(b.name, "fr", { numeric: true }));

export interface TankLine {
  tankId: string; name: string; fuel: Fuel | "other";
  stockInitial: number; approv: number; sortie: number; theorique: number;
  jauge: number; ecart: number; pu: number; ecartValorise: number; jours: number;
}

/** Bilan stock-sortie-écart par cuve d'une station. */
export function tankLines(tanks: ClosingTank[], readings: ClosingReading[], receptions: ClosingReception[], prices: Prices): TankLine[] {
  return sortTanks(tanks).map((t) => {
    const rs = readings.filter((r) => r.tank_id === t.id).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const fuel = fuelOf(t.product_type);
    const pu = fuel === "other" ? 0 : num(prices[fuel]);
    const stockInitial = rs.length ? num(rs[0].stock_ouverture) : 0;
    const jauge = rs.length ? num(rs[rs.length - 1].jauge) : 0;
    const sortie = rs.reduce((s, r) => s + num(r.sortie), 0);
    const approv = receptions.filter((r) => r.tank_id === t.id).reduce((s, r) => s + bookedQty(r), 0);
    const theorique = stockInitial + approv - sortie;
    const ecart = rs.length ? jauge - theorique : 0;
    return {
      tankId: t.id, name: t.name, fuel,
      stockInitial: round(stockInitial), approv: round(approv), sortie: round(sortie), theorique: round(theorique),
      jauge: round(jauge), ecart: round(ecart), pu, ecartValorise: round(ecart * pu), jours: rs.length,
    };
  });
}

export interface Period { from: string; to: string; label: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;

/** Semaines du lundi au dimanche, coupées aux fins de mois (comme les états papier). */
export function weeklyPeriods(from: string, to: string): Period[] {
  const out: Period[] = [];
  if (!from || !to || from > to) return out;
  const d = new Date(from + "T00:00:00Z"), end = new Date(to + "T00:00:00Z");
  let start = iso(d);
  while (d <= end && out.length < 600) {
    const next = new Date(d); next.setUTCDate(d.getUTCDate() + 1);
    const cut = d.getTime() === end.getTime() || d.getUTCDay() === 0 || next.getUTCMonth() !== d.getUTCMonth();
    if (cut) {
      const stop = iso(d);
      out.push({ from: start, to: stop, label: start === stop ? dm(stop) : `${start.slice(8, 10)}-${dm(stop)}` });
      start = iso(next);
    }
    d.setTime(next.getTime());
  }
  return out;
}

export interface PeriodSales {
  label: string; from: string; to: string;
  montant: number; bonsSociete: number; bonsClients: number; tickets: number; cartes: number;
  venteReelle: number; momo: number; liquidite: number; versementBanque: number; ecart: number;
}

const salesOf = (label: string, from: string, to: string, es: ClosingEntry[]): PeriodSales => {
  const s = (k: keyof ClosingEntry) => es.reduce((t, e) => t + num(e[k] as number | null), 0);
  const montant = s("vente_globale"), bonsSociete = s("autoconso_montant"), bonsClients = s("bons_clients_montant");
  const tickets = s("tickets_valeur_montant"), cartes = s("cartes_montant"), momo = s("versement_momo"), versementBanque = s("versement_banque");
  const venteReelle = montant - bonsSociete - bonsClients - tickets - cartes;
  const liquidite = venteReelle - momo;
  return {
    label, from, to, montant: round(montant), bonsSociete: round(bonsSociete), bonsClients: round(bonsClients),
    tickets: round(tickets), cartes: round(cartes), venteReelle: round(venteReelle), momo: round(momo),
    liquidite: round(liquidite), versementBanque: round(versementBanque), ecart: round(versementBanque - liquidite),
  };
};

/** Ventes et versements par période (lignes sans saisie omises) + total. */
export function periodSales(entries: ClosingEntry[], periods: Period[]): { rows: PeriodSales[]; total: PeriodSales } {
  const rows = periods
    .map((p) => ({ p, es: entries.filter((e) => e.entry_date >= p.from && e.entry_date <= p.to) }))
    .filter((x) => x.es.length > 0)
    .map(({ p, es }) => salesOf(p.label, p.from, p.to, es));
  const from = periods[0]?.from ?? "", to = periods[periods.length - 1]?.to ?? "";
  return { rows, total: salesOf("TOTAL", from, to, entries) };
}

const MONTHS = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];

export interface MonthDeliveries { month: string; label: string; from: string; to: string; nbBl: number; byTank: Record<string, number> }

/** Livraisons regroupées par mois : nombre de BL et volume BL par cuve. */
export function monthlyDeliveries(receptions: ClosingReception[], from: string, to: string): { rows: MonthDeliveries[]; total: MonthDeliveries } {
  const by = new Map<string, MonthDeliveries>();
  const total: MonthDeliveries = { month: "total", label: "TOTAL DES CHARGEMENTS", from, to, nbBl: 0, byTank: {} };
  for (const r of [...receptions].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = r.date.slice(0, 7);
    let row = by.get(m);
    if (!row) {
      const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
      row = { month: m, label: MONTHS[Number(m.slice(5, 7)) - 1], from: `${m}-01` < from ? from : `${m}-01`, to: last > to ? to : last, nbBl: 0, byTank: {} };
      by.set(m, row);
    }
    const q = bookedQty(r);
    row.nbBl += 1; total.nbBl += 1;
    if (r.tank_id) {
      row.byTank[r.tank_id] = round((row.byTank[r.tank_id] ?? 0) + q);
      total.byTank[r.tank_id] = round((total.byTank[r.tank_id] ?? 0) + q);
    }
  }
  return { rows: [...by.values()], total };
}

export interface Valuation {
  lines: { label: string; qty: number; pu: number; montant: number }[];
  approvisionnement: number; ventes: number; balance: number; stockControle: number; ecart: number; sommeEcartsValorises: number;
}

/** Valorisation du stock initial et des chargements, puis balance financière de l'arrêté. */
export function valuation(lines: TankLine[], ventes: number): Valuation {
  const v: Valuation["lines"] = [];
  lines.forEach((l) => v.push({ label: `Stock ${l.name}`, qty: l.stockInitial, pu: l.pu, montant: round(l.stockInitial * l.pu) }));
  lines.forEach((l) => v.push({ label: `Approv. ${l.name}`, qty: l.approv, pu: l.pu, montant: round(l.approv * l.pu) }));
  const approvisionnement = round(v.reduce((s, x) => s + x.montant, 0));
  const stockControle = round(lines.reduce((s, l) => s + l.jauge * l.pu, 0));
  const balance = round(approvisionnement - ventes);
  return {
    lines: v, approvisionnement, ventes: round(ventes), balance, stockControle,
    ecart: round(stockControle - balance),
    sommeEcartsValorises: round(lines.reduce((s, l) => s + l.ecartValorise, 0)),
  };
}

/** Totaux par carburant (lignes du bilan réseau). */
export function fuelTotals(lines: TankLine[]): Record<Fuel, Omit<TankLine, "tankId" | "name" | "fuel" | "pu" | "jours">> {
  const z = () => ({ stockInitial: 0, approv: 0, sortie: 0, theorique: 0, jauge: 0, ecart: 0, ecartValorise: 0 });
  const out = { super: z(), gasoil: z() };
  for (const l of lines) {
    if (l.fuel === "other") continue;
    const t = out[l.fuel];
    (Object.keys(t) as (keyof typeof t)[]).forEach((k) => { t[k] = round(t[k] + l[k]); });
  }
  return out;
}

/** Jour local (fuseau du pays) d'un horodatage. */
export const localDay = (ts: string, tz: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: tz });
