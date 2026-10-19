/**
 * Couche de métriques BI — calculs métier uniques, sans effet de bord.
 * Utilisée par l'espace BI, réutilisable par le Dashboard, les rapports et l'IA.
 * Les données reçues sont déjà filtrées par la base (tenant + pays autorisés).
 */
import { availabilityPct } from "@/lib/maintenance";
import { FUEL_PRICES } from "@/config/prices";

export type Kind = "super" | "gasoil" | "other";
export type Channel = "cash" | "card" | "voucher" | "mobile_money" | "fuel_card" | "b2b" | "other";

export const CHANNEL_LABELS: Record<Channel, string> = {
  cash: "Espèces", card: "Carte bancaire", voucher: "Ticket valeur", mobile_money: "Mobile Money",
  fuel_card: "Fuel Cards", b2b: "Crédit B2B", other: "Autres",
};

/** Ligne de vente normalisée (une par station / jour / produit). */
export type SaleFact = { date: string; stationId: string; countryId: string; zoneId: string | null; kind: Kind; volume: number; amount: number };

export type Dataset = {
  stations: { id: string; name: string; country_id: string; zone_id: string | null; status?: string }[];
  products: { id: string; name?: string; code?: string }[];
  closures: { id: string; station_id: string; closure_date: string; status: string }[];
  closureSales: { closure_id: string; product_id: string | null; volume: number; amount: number }[];
  closurePayments: { closure_id: string; payment_method_id: string | null; amount: number }[];
  paymentMethods: { id: string; code: string; kind?: string | null }[];
  entries: { station_id: string; entry_date: string; total_super_liters: number | null; total_gasoil_liters: number | null }[];
  levels: { station_id: string | null; tank_id: string | null; product_id: string | null; theoretical: number | null; capacity: number | null; variance: number | null; alert_level: string | null }[];
  recons: { station_id: string; recon_date: string; result: string; volume_variance: number | null; value_variance: number | null }[];
  consumptions: { client_id: string; station_id: string | null; product_id: string | null; consumed_on: string; litres: number; amount: number }[];
  invoices: { id: string; client_id: string; amount: number; due_on: string | null }[];
  payments: { invoice_id: string; amount: number }[];
  priceStructures: { country_id: string | null; effective_date: string; is_active: boolean; elements: any }[];
  assets: { id: string; station_id: string | null; status: string }[];
  workOrders: { asset_id: string; downtime_hours: number | null; labour_cost: number | null; parts_cost: number | null; completed_at: string | null; opened_at: string }[];
  inspections: { station_id: string; inspected_on: string; status: string; score: number | null }[];
  criticalNc: { station_id: string | null }[];
};

export type Filters = { start: string; end: string; zoneId?: string | null; stationId?: string | null; kind?: Kind | null; channel?: Channel | null; clientId?: string | null };

const n = (v: unknown) => Number(v) || 0;

export const productKind = (p?: { name?: string; code?: string } | null): Kind => {
  const s = `${p?.code ?? ""} ${p?.name ?? ""}`.toLowerCase();
  if (s.includes("gas") || s.includes("diesel")) return "gasoil";
  if (s.includes("sup") || s.includes("ess")) return "super";
  return "other";
};

export const channelOf = (code?: string | null): Channel => {
  const s = (code ?? "").toLowerCase();
  if (s.includes("cash") || s.includes("esp")) return "cash";
  if (s.includes("fuel") || s.includes("prepaid") || s.includes("postpaid")) return "fuel_card";
  if (s.includes("card") || s.includes("carte") || s.includes("tpe")) return "card";
  if (s.includes("voucher") || s.includes("ticket")) return "voucher";
  if (s.includes("momo") || s.includes("mobile")) return "mobile_money";
  if (s.includes("b2b") || s.includes("credit")) return "b2b";
  return "other";
};

/** Ventes : clôtures non rejetées, complétées par les saisies d'index des jours sans clôture. */
export const buildSaleFacts = (d: Dataset, f: Pick<Filters, "start" | "end">): SaleFact[] => {
  const st = new Map(d.stations.map((s) => [s.id, s]));
  const prod = new Map(d.products.map((p) => [p.id, p]));
  const closures = new Map(d.closures.filter((c) => c.status !== "rejected" && c.closure_date >= f.start && c.closure_date <= f.end).map((c) => [c.id, c]));
  const out = new Map<string, SaleFact>();
  const push = (date: string, sid: string, kind: Kind, vol: number, amt: number) => {
    const s = st.get(sid); if (!s) return;
    const k = `${date}|${sid}|${kind}`;
    const r = out.get(k) ?? { date, stationId: sid, countryId: s.country_id, zoneId: s.zone_id, kind, volume: 0, amount: 0 };
    r.volume += vol; r.amount += amt; out.set(k, r);
  };
  const closed = new Set<string>();
  d.closureSales.forEach((l) => {
    const c = closures.get(l.closure_id); if (!c) return;
    closed.add(`${c.closure_date}|${c.station_id}`);
    push(c.closure_date, c.station_id, productKind(l.product_id ? prod.get(l.product_id) : null), n(l.volume), n(l.amount));
  });
  closures.forEach((c) => closed.add(`${c.closure_date}|${c.station_id}`));
  d.entries.forEach((e) => {
    if (e.entry_date < f.start || e.entry_date > f.end || closed.has(`${e.entry_date}|${e.station_id}`)) return;
    const s = Math.max(0, n(e.total_super_liters)), g = Math.max(0, n(e.total_gasoil_liters)); // saisies négatives ignorées
    if (s) push(e.entry_date, e.station_id, "super", s, s * FUEL_PRICES.SUPER);
    if (g) push(e.entry_date, e.station_id, "gasoil", g, g * FUEL_PRICES.GASOIL);
  });
  return [...out.values()];
};

export const filterFacts = (facts: SaleFact[], f: Filters) =>
  facts.filter((x) => (!f.zoneId || (x.zoneId ?? "none") === f.zoneId) && (!f.stationId || x.stationId === f.stationId) && (!f.kind || x.kind === f.kind));

/** Marge unitaire (FCFA/L) = marge distributeur + marge détaillant de la structure de prix en vigueur. */
export const unitMargin = (d: Dataset, countryId: string, kind: Kind, date: string): number | null => {
  if (kind === "other") return null;
  const ps = d.priceStructures
    .filter((p) => p.is_active && (!p.country_id || p.country_id === countryId) && p.effective_date <= date)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  if (!ps || !Array.isArray(ps.elements)) return null;
  const rows = ps.elements.filter((e: any) => /^MARGE/i.test(String(e?.label ?? "")));
  if (!rows.length) return null;
  return rows.reduce((s: number, e: any) => s + n(e[kind]), 0);
};

export type Kpis = {
  volume: number; amount: number; margin: number | null; stock: number; capacity: number;
  rotation: number | null; coverageDays: number | null; ruptures: number; critical: number;
  varianceVolume: number; varianceValue: number; anomalies: number;
  receivables: number; overdue: number; availability: number; maintenanceCost: number;
  compliance: number | null; openCriticalNc: number; stations: number;
};

export const daysBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);

/** Toutes les KPI pour un ensemble de stations et des filtres donnés. */
export const computeKpis = (d: Dataset, f: Filters, today = new Date().toISOString().slice(0, 10)): Kpis => {
  const stations = d.stations.filter((s) => s.status !== "inactive" && (!f.zoneId || (s.zone_id ?? "none") === f.zoneId) && (!f.stationId || s.id === f.stationId));
  const ids = new Set(stations.map((s) => s.id));
  const prod = new Map(d.products.map((p) => [p.id, p]));
  const kindOk = (pid: string | null) => !f.kind || productKind(pid ? prod.get(pid) : null) === f.kind;

  const facts = filterFacts(buildSaleFacts(d, f), f).filter((x) => ids.has(x.stationId));
  const volume = facts.reduce((s, x) => s + x.volume, 0);
  const amount = facts.reduce((s, x) => s + x.amount, 0);
  let margin: number | null = 0;
  for (const x of facts) {
    const m = unitMargin(d, x.countryId, x.kind, x.date);
    if (m == null) { margin = null; break; }
    margin += m * x.volume;
  }
  if (!facts.length) margin = null;

  const lv = d.levels.filter((l) => l.station_id && ids.has(l.station_id) && kindOk(l.product_id));
  const stock = lv.reduce((s, l) => s + Math.max(0, n(l.theoretical)), 0);
  const capacity = lv.reduce((s, l) => s + n(l.capacity), 0);
  const days = daysBetween(f.start, f.end);
  const rotation = stock > 0 ? volume / stock : null;
  const coverageDays = volume > 0 ? stock / (volume / days) : null;

  const rc = d.recons.filter((r) => ids.has(r.station_id) && r.recon_date >= f.start && r.recon_date <= f.end);
  const clientOk = (c: string) => !f.clientId || c === f.clientId;
  const inv = d.invoices.filter((i) => clientOk(i.client_id));
  const paid = new Map<string, number>();
  d.payments.forEach((p) => paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + n(p.amount)));
  const open = inv.map((i) => ({ ...i, rest: Math.max(0, n(i.amount) - (paid.get(i.id) ?? 0)) }));

  const assets = d.assets.filter((a) => !a.station_id || ids.has(a.station_id));
  const aIds = new Set(assets.map((a) => a.id));
  const wo = d.workOrders.filter((w) => aIds.has(w.asset_id) && w.opened_at.slice(0, 10) <= f.end && (w.completed_at ?? today) >= f.start);

  const lastInsp = new Map<string, { d: string; s: number }>();
  d.inspections.filter((i) => i.status === "validated" && ids.has(i.station_id) && i.score != null).forEach((i) => {
    const cur = lastInsp.get(i.station_id);
    if (!cur || i.inspected_on > cur.d) lastInsp.set(i.station_id, { d: i.inspected_on, s: n(i.score) });
  });
  const insp = [...lastInsp.values()];

  return {
    volume, amount, margin, stock, capacity, rotation, coverageDays,
    ruptures: lv.filter((l) => l.alert_level === "rupture").length,
    critical: lv.filter((l) => l.alert_level === "critical").length,
    varianceVolume: rc.reduce((s, r) => s + n(r.volume_variance), 0),
    varianceValue: rc.reduce((s, r) => s + n(r.value_variance), 0),
    anomalies: rc.filter((r) => r.result === "anomaly" || r.result === "critical").length,
    receivables: open.reduce((s, i) => s + i.rest, 0),
    overdue: open.filter((i) => i.due_on && i.due_on < today).reduce((s, i) => s + i.rest, 0),
    availability: availabilityPct(assets.length, wo.reduce((s, w) => s + n(w.downtime_hours), 0), days),
    maintenanceCost: wo.reduce((s, w) => s + n(w.labour_cost) + n(w.parts_cost), 0),
    compliance: insp.length ? Math.round(insp.reduce((s, i) => s + i.s, 0) / insp.length) : null,
    openCriticalNc: d.criticalNc.filter((c) => c.station_id && ids.has(c.station_id)).length,
    stations: stations.length,
  };
};

/** Encaissements ventilés par canal (clôtures + consommations B2B). */
export const channelBreakdown = (d: Dataset, f: Filters) => {
  const ids = new Set(d.stations.filter((s) => (!f.zoneId || (s.zone_id ?? "none") === f.zoneId) && (!f.stationId || s.id === f.stationId)).map((s) => s.id));
  const pm = new Map(d.paymentMethods.map((m) => [m.id, m]));
  const cl = new Map(d.closures.filter((c) => c.status !== "rejected" && c.closure_date >= f.start && c.closure_date <= f.end && ids.has(c.station_id)).map((c) => [c.id, c]));
  const out = new Map<Channel, number>();
  d.closurePayments.forEach((p) => {
    if (!cl.has(p.closure_id)) return;
    const m = p.payment_method_id ? pm.get(p.payment_method_id) : null;
    const ch = channelOf(m?.kind ?? m?.code);
    out.set(ch, (out.get(ch) ?? 0) + n(p.amount));
  });
  d.consumptions.forEach((c) => {
    if (c.consumed_on < f.start || c.consumed_on > f.end || (c.station_id && !ids.has(c.station_id)) || (f.clientId && c.client_id !== f.clientId)) return;
    out.set("b2b", (out.get("b2b") ?? 0) + n(c.amount));
  });
  return [...out.entries()].map(([channel, amount]) => ({ channel, amount })).filter((x) => !f.channel || x.channel === f.channel);
};

/** Agrégation des ventes par clé (date, station, pays, zone, produit). */
export const groupFacts = (facts: SaleFact[], key: (f: SaleFact) => string) => {
  const m = new Map<string, { key: string; volume: number; amount: number }>();
  facts.forEach((f) => { const k = key(f); const r = m.get(k) ?? { key: k, volume: 0, amount: 0 }; r.volume += f.volume; r.amount += f.amount; m.set(k, r); });
  return [...m.values()];
};

/** Variation en % par rapport à la période précédente (null si base nulle). */
export const deltaPct = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

/** Période précédente de même durée. */
export const previousRange = (start: string, end: string) => {
  const len = daysBetween(start, end);
  const e = new Date(Date.parse(start) - 86_400_000);
  const s = new Date(e.getTime() - (len - 1) * 86_400_000);
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
};

/** Performance station 0–100 : volume relatif (50), conformité (25), disponibilité stock (25). */
export const stationPerformance = (volume: number, maxVolume: number, compliance: number | null, ruptures: number) =>
  Math.round((maxVolume > 0 ? (Math.max(0, volume) / maxVolume) * 50 : 0) + ((compliance ?? 0) / 100) * 25 + (ruptures ? 0 : 25));
