/** Approvisionnement dépôt : calculs purs pro-forma / bon de commande (miroir des règles serveur). */
export type PaymentStatus = "non_paye" | "pret_credit" | "paiement_direct";
export interface LineInput { qty_litres: number; unit_price: number; tax_rate: number }
export interface LineAmounts { amount_ht: number; tax_amount: number; amount_ttc: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

export function lineAmounts(l: LineInput): LineAmounts {
  const ht = r2((l.qty_litres || 0) * (l.unit_price || 0));
  const tax = r2((ht * (l.tax_rate || 0)) / 100);
  return { amount_ht: ht, tax_amount: tax, amount_ttc: r2(ht + tax) };
}

export function proformaTotals(lines: LineInput[]): LineAmounts {
  return lines.map(lineAmounts).reduce(
    (a, x) => ({ amount_ht: r2(a.amount_ht + x.amount_ht), tax_amount: r2(a.tax_amount + x.tax_amount), amount_ttc: r2(a.amount_ttc + x.amount_ttc) }),
    { amount_ht: 0, tax_amount: 0, amount_ttc: 0 },
  );
}

/** Un pro-forma seul n'autorise jamais l'enlèvement : il faut un BC payé ou à crédit. */
export function isAuthorized(status: PaymentStatus | null | undefined): boolean {
  return status === "pret_credit" || status === "paiement_direct";
}

export interface Counters { ordered: number; authorized: number; lifted: number; available: number }

export function orderCounters(lines: { qty_litres: number; qty_lifted?: number }[], status: PaymentStatus | null | undefined): Counters {
  const ordered = lines.reduce((s, l) => s + (l.qty_litres || 0), 0);
  const lifted = lines.reduce((s, l) => s + (l.qty_lifted || 0), 0);
  const authorized = isAuthorized(status) ? ordered : 0;
  return { ordered, authorized, lifted, available: Math.max(0, authorized - lifted) };
}

export function sumCounters(list: Counters[]): Counters {
  return list.reduce((a, c) => ({ ordered: a.ordered + c.ordered, authorized: a.authorized + c.authorized, lifted: a.lifted + c.lifted, available: a.available + c.available }), { ordered: 0, authorized: 0, lifted: 0, available: 0 });
}

/* ---------- Bons d'enlèvement (miroir de depot_supply_action create_lifting) ---------- */
export type LiftingStatus = "established" | "signed" | "cancelled";
export interface PoLine { id: string; product_id: string; qty_litres: number; qty_lifted?: number }
export interface ReservedLine { proforma_line_id: string; qty_litres: number; status: LiftingStatus }

/** Solde disponible par produit = autorisé − déjà enlevé (BE signés) − réservé (BE établis non signés). */
export function productBalances(lines: PoLine[], status: PaymentStatus | null | undefined, liftings: ReservedLine[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    const reserved = liftings.filter((x) => x.proforma_line_id === l.id && x.status === "established").reduce((s, x) => s + (x.qty_litres || 0), 0);
    const free = isAuthorized(status) ? (l.qty_litres || 0) - (l.qty_lifted || 0) - reserved : 0;
    out[l.product_id] = (out[l.product_id] ?? 0) + Math.max(0, free);
  }
  return out;
}

export function planByProduct(plan: { product_id: string; qty_litres: number | string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of plan) if (p.product_id) out[p.product_id] = (out[p.product_id] ?? 0) + (Number(p.qty_litres) || 0);
  return out;
}

/** Produits du plan qui dépassent le solde du BC (ou absents du BC). */
export function planExcess(plan: { product_id: string; qty_litres: number | string }[], balances: Record<string, number>) {
  return Object.entries(planByProduct(plan))
    .filter(([pid, q]) => q > (balances[pid] ?? 0))
    .map(([product_id, requested]) => ({ product_id, requested, available: balances[product_id] ?? 0 }));
}

/** Compteurs ventilés par produit (aucun cumul entre Super, Gasoil, etc.). */
export function productCounters(
  orders: { lines: { product_id: string; product_name?: string; qty_litres: number; qty_lifted?: number }[]; status: PaymentStatus | null | undefined }[],
): (Counters & { product_id: string; product_name: string })[] {
  const out = new Map<string, Counters & { product_id: string; product_name: string }>();
  for (const o of orders) for (const l of o.lines) {
    const c = out.get(l.product_id) ?? { product_id: l.product_id, product_name: l.product_name ?? "—", ordered: 0, authorized: 0, lifted: 0, available: 0 };
    const x = orderCounters([l], o.status);
    c.ordered += x.ordered; c.authorized += x.authorized; c.lifted += x.lifted; c.available += x.available;
    out.set(l.product_id, c);
  }
  return [...out.values()].sort((a, b) => a.product_name.localeCompare(b.product_name));
}

/** Un BC est modifiable/supprimable tant qu'aucun bon d'enlèvement n'y est rattaché et rien n'est enlevé. */
export function isEditableOrder(liftingCount: number, lines: { qty_lifted?: number }[]): boolean {
  return liftingCount === 0 && lines.every((l) => !(l.qty_lifted || 0));
}

/** Stock disponible au dépôt par produit = BC payés/crédit du dépôt − enlevé (BE signés) − réservé (BE établis). Aucun BC précis n'est requis. */
export function depotBalances(
  orders: { depot_id: string | null | undefined; status: PaymentStatus | null | undefined; lines: PoLine[] }[],
  depotId: string | null | undefined,
  liftings: ReservedLine[] = [],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!depotId) return out;
  for (const o of orders) {
    if (o.depot_id !== depotId) continue;
    const b = productBalances(o.lines, o.status, liftings);
    for (const [pid, q] of Object.entries(b)) out[pid] = (out[pid] ?? 0) + q;
  }
  return out;
}
