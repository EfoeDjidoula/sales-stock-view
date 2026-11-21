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
