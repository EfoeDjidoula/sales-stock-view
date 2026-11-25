// Phase 8 — read-only logistics KPIs & stock sheets (pure, testable).
export interface Discharge { trip_id: string; product_id: string; station_id: string | null; qty_bl: number; qty_measured: number; created_at: string }
export interface Trip { id: string; carrier_id?: string | null; truck_id?: string | null; driver_id?: string | null; loaded_at?: string | null; departed_at?: string | null; delivered_at?: string | null }

const hours = (a?: string | null, b?: string | null) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3.6e6 : null);
const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null && x >= 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/** Transport loss per group: loss% = (BL − measured) / BL. Positive = loss. */
export function lossBy(dis: Discharge[], trips: Trip[], key: "carrier_id" | "truck_id" | "driver_id") {
  const m = new Map<string, { bl: number; measured: number; n: number }>();
  for (const x of dis) {
    const k = trips.find((t) => t.id === x.trip_id)?.[key] ?? "—";
    const g = m.get(k) ?? { bl: 0, measured: 0, n: 0 };
    g.bl += Number(x.qty_bl); g.measured += Number(x.qty_measured); g.n++; m.set(k, g);
  }
  return [...m].map(([id, g]) => ({ id, ...g, loss: g.bl - g.measured, lossPct: g.bl ? ((g.bl - g.measured) / g.bl) * 100 : 0 })).sort((a, b) => b.lossPct - a.lossPct);
}

/** Average durations (hours): BE issued → loaded → departed → delivered → discharged. */
export function rotation(liftings: { trip_id: string | null; created_at: string }[], trips: Trip[], dis: Discharge[]) {
  const per = trips.map((t) => {
    const be = liftings.find((b) => b.trip_id === t.id)?.created_at;
    const firstDis = dis.filter((d) => d.trip_id === t.id).map((d) => d.created_at).sort()[0];
    return { beToLoad: hours(be, t.loaded_at), loadToDepart: hours(t.loaded_at, t.departed_at), transit: hours(t.departed_at ?? t.loaded_at, t.delivered_at), toDischarge: hours(t.delivered_at, firstDis), total: hours(be ?? t.loaded_at, firstDis ?? t.delivered_at) };
  });
  return { beToLoad: avg(per.map((p) => p.beToLoad)), loadToDepart: avg(per.map((p) => p.loadToDepart)), transit: avg(per.map((p) => p.transit)), toDischarge: avg(per.map((p) => p.toDischarge)), total: avg(per.map((p) => p.total)) };
}

/** Order execution: ordered (pro-forma lines with a PO) vs lifted vs delivered. */
export function execution(ordered: number, lifted: number, delivered: number) {
  return { ordered, lifted, delivered, liftedPct: ordered ? (lifted / ordered) * 100 : 0, deliveredPct: ordered ? (delivered / ordered) * 100 : 0, notLifted: Math.max(0, ordered - lifted), inTransit: Math.max(0, lifted - delivered) };
}

export interface SheetLine { date: string; kind: "order" | "lifting" | "delivery_note" | "discharge"; ref: string; product_id: string; qty: number }
/** Chronological stock sheet per product with running balances of the 3 stocks. */
export function stockSheet(lines: SheetLine[]) {
  let notLifted = 0, transit = 0, received = 0;
  return [...lines].sort((a, b) => a.date.localeCompare(b.date) || order(a.kind) - order(b.kind)).map((l) => {
    if (l.kind === "order") notLifted += l.qty;
    if (l.kind === "lifting") { notLifted -= l.qty; transit += l.qty; }
    if (l.kind === "discharge") { transit -= l.qty; received += l.qty; }
    return { ...l, notLifted, transit, received };
  });
}
const order = (k: SheetLine["kind"]) => ["order", "lifting", "delivery_note", "discharge"].indexOf(k);
