/**
 * Calculs purs de la Suite Pro : coulage thermique, écritures comptables,
 * relevés B2B et file hors-ligne. Aucune écriture en base ici.
 */

/** Coefficients de dilatation volumique (par °C) — valeurs usuelles ASTM 54B. */
export const THERMAL_ALPHA: Record<string, number> = { super: 0.0012, gasoil: 0.00083 };
export const REFERENCE_TEMP = 15;

export const productFamily = (codeOrName: string): "super" | "gasoil" =>
  /gas|diesel|go\b/i.test(codeOrName) ? "gasoil" : "super";

/** Volume ramené à 15 °C : V15 = V × (1 − α × (T − 15)). */
export function volumeAt15(volume: number, tempC: number, family: "super" | "gasoil"): number {
  return volume * (1 - THERMAL_ALPHA[family] * (tempC - REFERENCE_TEMP));
}

export interface ThermalResult {
  loaded15: number;
  received15: number;
  apparentLoss: number;
  thermalPart: number;
  realLoss: number;
  realLossPct: number;
}

/** Sépare l'écart apparent en part thermique (dilatation) et perte réelle. */
export function splitThermalLoss(
  loaded: number, tempLoad: number, received: number, tempReceive: number, family: "super" | "gasoil",
): ThermalResult {
  const loaded15 = volumeAt15(loaded, tempLoad, family);
  const received15 = volumeAt15(received, tempReceive, family);
  const apparentLoss = loaded - received;
  const realLoss = loaded15 - received15;
  return {
    loaded15, received15, apparentLoss,
    thermalPart: apparentLoss - realLoss,
    realLoss,
    realLossPct: loaded15 > 0 ? (realLoss / loaded15) * 100 : 0,
  };
}

/** Plan comptable SYSCOHADA révisé (comptes par défaut, modifiables à l'export). */
export const OHADA_ACCOUNTS = {
  cash: "571000", bank: "521000", mobile: "585000", customers: "411000",
  sales: "701100", vat: "443100",
};

export interface JournalLine {
  date: string; journal: string; account: string; label: string; ref: string; debit: number; credit: number;
}

/** Comptes de trésorerie selon le mode d'encaissement. */
export function treasuryAccount(method: string): string {
  const m = method.toLowerCase();
  if (/esp|cash/.test(m)) return OHADA_ACCOUNTS.cash;
  if (/mobile|momo|money/.test(m)) return OHADA_ACCOUNTS.mobile;
  if (/crédit|credit|b2b|fuel|carte carbu|ticket/.test(m)) return OHADA_ACCOUNTS.customers;
  return OHADA_ACCOUNTS.bank;
}

/** Écriture équilibrée d'une clôture : débit trésorerie par mode, crédit ventes. */
export function closureEntries(
  c: { date: string; ref: string; station: string; amount: number },
  payments: { method: string; amount: number }[],
): JournalLine[] {
  const lines: JournalLine[] = [];
  const byAcc = new Map<string, number>();
  for (const p of payments) byAcc.set(treasuryAccount(p.method), (byAcc.get(treasuryAccount(p.method)) ?? 0) + p.amount);
  const collected = [...byAcc.values()].reduce((s, v) => s + v, 0);
  const missing = Math.round((c.amount - collected) * 100) / 100;
  if (missing > 0) byAcc.set(OHADA_ACCOUNTS.customers, (byAcc.get(OHADA_ACCOUNTS.customers) ?? 0) + missing);
  for (const [account, v] of byAcc) {
    if (v > 0) lines.push({ date: c.date, journal: "VT", account, label: `Ventes ${c.station}`, ref: c.ref, debit: v, credit: 0 });
  }
  const credit = Math.max(c.amount, collected);
  lines.push({ date: c.date, journal: "VT", account: OHADA_ACCOUNTS.sales, label: `Ventes carburant ${c.station}`, ref: c.ref, debit: 0, credit });
  return lines;
}

export const journalBalanced = (lines: JournalLine[]) =>
  Math.abs(lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.01;

/** Relevé client : solde = factures − paiements, en ordre chronologique. */
export function customerStatement(
  invoices: { date: string; ref: string; amount: number }[],
  payments: { date: string; ref: string; amount: number }[],
) {
  const rows = [
    ...invoices.map((i) => ({ ...i, debit: i.amount, credit: 0, kind: "Facture" })),
    ...payments.map((p) => ({ ...p, debit: 0, credit: p.amount, kind: "Paiement" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return rows.map((r) => ({ ...r, balance: (bal += r.debit - r.credit) }));
}

/** File hors-ligne (localStorage) pour les saisies terrain. */
export interface OfflineItem { id: string; table: string; row: Record<string, unknown>; createdAt: string; error?: string }
const KEY = "lumatek.offlineQueue";
export const offlineQueue = {
  list(): OfflineItem[] {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  },
  save(items: OfflineItem[]) { localStorage.setItem(KEY, JSON.stringify(items)); },
  add(table: string, row: Record<string, unknown>) {
    const item: OfflineItem = { id: crypto.randomUUID(), table, row, createdAt: new Date().toISOString() };
    offlineQueue.save([...offlineQueue.list(), item]);
    return item;
  },
};
