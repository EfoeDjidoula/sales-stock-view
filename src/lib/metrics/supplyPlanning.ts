/** Besoins d'approvisionnement calculés (règles explicables) — base des suggestions IA. */
import { buildSaleFacts, productKind, type Dataset, type Kind } from "./index";

export const TARGET_COVERAGE_DAYS = 3; // en dessous : réapprovisionner
export const FILL_TARGET_PCT = 95;     // remplissage visé des cuves (marge de sécurité)
const OPEN_SUPPLY = ["submitted", "approved", "ordered", "loaded", "in_transit", "delivered"];

export type SupplyNeed = {
  stationId: string; stationName: string; kind: Kind; stock: number; capacity: number;
  avgDaily: number; forecastDaily: number | null; forecastModel: string | null; forecastConfidence: string | null; daysToRupture: number | null;
  coverageDays: number | null; inTransit: number; needLitres: number; urgency: "haute" | "moyenne" | "faible";
};
export type TruckCapacity = { id: string; registration: string; capacity: number; compartments: number[] };
export type SupplyForecast = { daily: number | null; confidence: string; daysToRupture: number | null; modelId: string };

export const computeSupplyNeeds = (
  d: Dataset & { openSupplies?: { station_id: string | null; product_id: string | null; status: string; qty_requested: number | null; qty_approved: number | null; qty_loaded: number | null }[] },
  start: string, end: string, days: number,
  forecasts?: Map<string, SupplyForecast>, // clé `${stationId}|${kind}` — prévisions BI (computeForecasts)
): SupplyNeed[] => {
  const prod = new Map(d.products.map((p) => [p.id, p]));
  const kindOf = (pid: string | null) => productKind(pid ? prod.get(pid) : null);
  const sales = new Map<string, number>();
  buildSaleFacts(d, { start, end }).forEach((f) => sales.set(`${f.stationId}|${f.kind}`, (sales.get(`${f.stationId}|${f.kind}`) ?? 0) + f.volume));
  const transit = new Map<string, number>();
  (d.openSupplies ?? []).filter((s) => s.station_id && OPEN_SUPPLY.includes(s.status)).forEach((s) => {
    const k = `${s.station_id}|${kindOf(s.product_id)}`;
    transit.set(k, (transit.get(k) ?? 0) + Number(s.qty_loaded ?? s.qty_approved ?? s.qty_requested ?? 0));
  });
  const agg = new Map<string, { stock: number; capacity: number }>();
  d.levels.forEach((l) => {
    if (!l.station_id) return;
    const kind = kindOf(l.product_id); if (kind === "other") return;
    const k = `${l.station_id}|${kind}`;
    const a = agg.get(k) ?? { stock: 0, capacity: 0 };
    a.stock += Math.max(0, Number(l.theoretical) || 0); a.capacity += Number(l.capacity) || 0; agg.set(k, a);
  });
  const names = new Map(d.stations.filter((s) => s.status !== "inactive").map((s) => [s.id, s.name]));
  const out: SupplyNeed[] = [];
  agg.forEach((a, k) => {
    const [stationId, kind] = k.split("|") as [string, Kind];
    if (!names.has(stationId) || a.capacity <= 0) return;
    const avgDaily = (sales.get(k) ?? 0) / Math.max(1, days);
    // Prévision BI : quand le modèle a assez d'historique, le rythme prévu remplace la moyenne constatée.
    const fc = forecasts?.get(k);
    const forecastDaily = fc && fc.confidence !== "insufficient" && fc.daily != null && Number.isFinite(fc.daily) && fc.daily >= 0 ? fc.daily : null;
    const effectiveDaily = forecastDaily ?? avgDaily;
    const inTransit = transit.get(k) ?? 0;
    const coverageDays = effectiveDaily > 0 ? (a.stock + inTransit) / effectiveDaily : null;
    const room = Math.max(0, Math.floor((a.capacity * FILL_TARGET_PCT) / 100 - a.stock - inTransit));
    const low = coverageDays != null ? coverageDays < TARGET_COVERAGE_DAYS : (a.stock + inTransit) / a.capacity < 0.25;
    if (!low || room <= 0) return;
    const rupture = forecastDaily != null ? fc!.daysToRupture : null;
    const urgency = coverageDays != null && coverageDays < 1 ? "haute" : (a.stock / a.capacity) < 0.1 ? "haute" : rupture != null && rupture <= 2 ? "haute" : coverageDays != null && coverageDays < 2 ? "moyenne" : "faible";
    out.push({ stationId, stationName: names.get(stationId)!, kind, stock: a.stock, capacity: a.capacity, avgDaily, forecastDaily, forecastModel: forecastDaily != null ? fc!.modelId : null, forecastConfidence: forecastDaily != null ? fc!.confidence : null, daysToRupture: rupture, coverageDays, inTransit, needLitres: room, urgency });
  });
  const rank = { haute: 0, moyenne: 1, faible: 2 };
  return out.sort((x, y) => rank[x.urgency] - rank[y.urgency] || (x.coverageDays ?? 99) - (y.coverageDays ?? 99));
};
