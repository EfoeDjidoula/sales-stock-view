/**
 * Séparation stricte des 3 stocks logistiques (calcul pur, lecture seule).
 * 1. Commandé (théorique fournisseur) : volume approuvé non encore enlevé.
 * 2. Enlevé / en transit : volume chargé au BL, pas encore réceptionné en cuve.
 * 3. Réceptionné : comptabilisé au volume BL chargé ; la jauge sert à l'écart camion.
 */
export type SupplyRow = {
  id: string; status: string; product: string; station?: string | null;
  qty_requested?: number | null; qty_approved?: number | null;
  qty_loaded?: number | null; qty_received?: number | null; date?: string | null;
};
export type StockTotals = {
  ordered: number; openOrdered: number; loaded: number; inTransit: number;
  receivedBL: number; receivedGauge: number; depotVariance: number; truckVariance: number; count: number;
};

const ORDER_STAGES = ["approved", "ordered", "loaded", "in_transit", "delivered", "received"];
const LOADED_STAGES = ["loaded", "in_transit", "delivered", "received"];
const TRANSIT_STAGES = ["loaded", "in_transit", "delivered"];
const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

export const emptyTotals = (): StockTotals => ({ ordered: 0, openOrdered: 0, loaded: 0, inTransit: 0, receivedBL: 0, receivedGauge: 0, depotVariance: 0, truckVariance: 0, count: 0 });

export function supplyStocks(r: SupplyRow): StockTotals {
  const t = emptyTotals();
  if (!ORDER_STAGES.includes(r.status)) return t;
  t.count = 1;
  t.ordered = r.qty_approved != null ? n(r.qty_approved) : n(r.qty_requested);
  if (!LOADED_STAGES.includes(r.status)) { t.openOrdered = t.ordered; return t; }
  t.loaded = n(r.qty_loaded);
  t.depotVariance = t.loaded - t.ordered;
  if (TRANSIT_STAGES.includes(r.status)) { t.inTransit = t.loaded; return t; }
  t.receivedBL = t.loaded;
  t.receivedGauge = n(r.qty_received);
  t.truckVariance = t.receivedGauge - t.loaded;
  return t;
}

export function addTotals(a: StockTotals, b: StockTotals): StockTotals {
  const o = { ...a };
  (Object.keys(o) as (keyof StockTotals)[]).forEach((k) => { o[k] = a[k] + b[k]; });
  return o;
}

export function groupStocks(rows: SupplyRow[], key: (r: SupplyRow) => string): Map<string, StockTotals> {
  const m = new Map<string, StockTotals>();
  for (const r of rows) { const k = key(r); m.set(k, addTotals(m.get(k) ?? emptyTotals(), supplyStocks(r))); }
  return m;
}
