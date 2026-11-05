/**
 * Rapports périodiques — calculs purs à partir de données déjà scoupées (tenant + pays via RLS).
 * Aucun accès base ici : réutilisable par l'écran Rapports, les exports et l'IA.
 */
export type Kind = "super" | "gasoil" | "other";
const n = (v: unknown) => Number(v) || 0;

export const kindOf = (p?: { name?: string; code?: string } | null): Kind => {
  const s = `${p?.code ?? ""} ${p?.name ?? ""}`.toLowerCase();
  if (s.includes("gas") || s.includes("diesel")) return "gasoil";
  if (s.includes("sup") || s.includes("ess")) return "super";
  return "other";
};

export const addDays = (d: string, k: number) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + k);
  return x.toISOString().slice(0, 10);
};

export const pctChange = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

export type Closure = { id: string; station_id: string; closure_date: string; status: string };
export type Sale = { closure_id: string; product_id: string | null; volume: number; amount: number };

/** Ventes par jour (clôtures non rejetées) : volume Super/Gasoil et CA. */
export function salesByDay(closures: Closure[], sales: Sale[], kindOfProduct: (id: string | null) => Kind) {
  const day = new Map(closures.filter((c) => c.status !== "rejected").map((c) => [c.id, c]));
  const out = new Map<string, { super: number; gasoil: number; amount: number }>();
  for (const s of sales) {
    const c = day.get(s.closure_id);
    if (!c) continue;
    const r = out.get(c.closure_date) ?? { super: 0, gasoil: 0, amount: 0 };
    const k = kindOfProduct(s.product_id);
    if (k === "super") r.super += n(s.volume);
    if (k === "gasoil") r.gasoil += n(s.volume);
    r.amount += n(s.amount);
    out.set(c.closure_date, r);
  }
  return out;
}

/** Flash du jour comparé à J-1 et J-7. */
export function dailyFlash(byDay: Map<string, { super: number; gasoil: number; amount: number }>, date: string) {
  const z = { super: 0, gasoil: 0, amount: 0 };
  const cur = byDay.get(date) ?? z, d1 = byDay.get(addDays(date, -1)) ?? z, d7 = byDay.get(addDays(date, -7)) ?? z;
  return { cur, d1, d7, vsD1: pctChange(cur.amount, d1.amount), vsD7: pctChange(cur.amount, d7.amount) };
}

/** Totaux par station sur une période (volume, CA). */
export function salesByStation(closures: Closure[], sales: Sale[], from: string, to: string) {
  const ok = new Map(closures.filter((c) => c.status !== "rejected" && c.closure_date >= from && c.closure_date <= to).map((c) => [c.id, c.station_id]));
  const out = new Map<string, { volume: number; amount: number }>();
  for (const s of sales) {
    const st = ok.get(s.closure_id);
    if (!st) continue;
    const r = out.get(st) ?? { volume: 0, amount: 0 };
    r.volume += n(s.volume); r.amount += n(s.amount);
    out.set(st, r);
  }
  return out;
}

/** Balance âgée : reste dû par client ventilé par retard d'échéance. */
export type Bucket = "notDue" | "d0_30" | "d31_60" | "d60p";
export function agedBalance(
  invoices: { id: string; client_id: string; amount: number; due_on: string | null }[],
  payments: { invoice_id: string; amount: number }[],
  asOf: string,
) {
  const paid = new Map<string, number>();
  payments.forEach((p) => paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + n(p.amount)));
  const out = new Map<string, Record<Bucket, number> & { total: number }>();
  for (const i of invoices) {
    const due = n(i.amount) - (paid.get(i.id) ?? 0);
    if (due <= 0.005) continue;
    const late = i.due_on ? Math.floor((Date.parse(asOf) - Date.parse(i.due_on)) / 86400000) : 0;
    const b: Bucket = late <= 0 ? "notDue" : late <= 30 ? "d0_30" : late <= 60 ? "d31_60" : "d60p";
    const r = out.get(i.client_id) ?? { notDue: 0, d0_30: 0, d31_60: 0, d60p: 0, total: 0 };
    r[b] += due; r.total += due;
    out.set(i.client_id, r);
  }
  return out;
}

/** Performance logistique : taux de livraison, durée moyenne (h), écart chargé/livré. */
export function logisticsSummary(trips: { status: string; qty_loaded: number | null; qty_delivered: number | null; departed_at: string | null; delivered_at: string | null }[]) {
  const done = trips.filter((t) => t.status === "delivered");
  const durations = done.filter((t) => t.departed_at && t.delivered_at).map((t) => (Date.parse(t.delivered_at!) - Date.parse(t.departed_at!)) / 3600000);
  const loaded = done.reduce((s, t) => s + n(t.qty_loaded), 0);
  const delivered = done.reduce((s, t) => s + n(t.qty_delivered), 0);
  return {
    total: trips.length, delivered: done.length,
    incidents: trips.filter((t) => t.status === "incident").length,
    rate: trips.length ? (done.length / trips.length) * 100 : null,
    avgHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    gap: delivered - loaded, gapPct: loaded ? ((delivered - loaded) / loaded) * 100 : null,
  };
}
