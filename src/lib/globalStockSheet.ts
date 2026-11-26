/** Fiche globale par produit : stock dépôt début de journée + achats (BC payés/crédit) − enlevés (BE) ventilés par station = fin de journée.
 * Aucune vente pistolet, aucun transit ni dépotage (choix métier). */
export interface GsPurchase { date: string; number: string; proforma: string; depot: string; qty: number }
export interface GsLifting { date: string; number: string; truck: string; driver: string; qty: number; stations: { name: string; qty: number }[] }
export interface GsDay { date: string; opening: number; purchases: GsPurchase[]; liftings: GsLifting[]; inQty: number; outQty: number; closing: number; byStation: Record<string, number> }

export function buildGlobalSheet(purchases: GsPurchase[], liftings: GsLifting[], from: string, to: string): GsDay[] {
  let stock = purchases.filter((p) => p.date < from).reduce((s, p) => s + p.qty, 0)
    - liftings.filter((l) => l.date < from).reduce((s, l) => s + l.qty, 0);
  const days: GsDay[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const ps = purchases.filter((p) => p.date === date);
    const ls = liftings.filter((l) => l.date === date);
    const inQty = ps.reduce((s, p) => s + p.qty, 0);
    const outQty = ls.reduce((s, l) => s + l.qty, 0);
    const byStation: Record<string, number> = {};
    ls.forEach((l) => l.stations.forEach((s) => { byStation[s.name] = (byStation[s.name] ?? 0) + s.qty; }));
    days.push({ date, opening: stock, purchases: ps, liftings: ls, inQty, outQty, closing: stock + inQty - outQty, byStation });
    stock += inQty - outQty;
  }
  return days;
}

/** Ventilation station d'un BE : chargements du voyage pour ce produit ; le reste non affecté est « Non ventilé ». */
export function splitByStation(total: number, loads: { name: string; qty: number }[]): { name: string; qty: number }[] {
  const m = new Map<string, number>();
  loads.forEach((l) => m.set(l.name, (m.get(l.name) ?? 0) + l.qty));
  const out = [...m].map(([name, qty]) => ({ name, qty }));
  const rest = total - out.reduce((s, x) => s + x.qty, 0);
  if (rest > 0) out.push({ name: "Non ventilé", qty: rest });
  return out;
}
