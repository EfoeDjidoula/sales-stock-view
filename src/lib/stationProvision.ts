// Phase 7 — mise à disposition des stations (lecture seule), volume BL chargé × prix pompe du pays en vigueur à la date de livraison.
export interface ProvisionLine { stationId: string; productId: string; date: string; litres: number; unitPrice: number; amount: number; tripRef: string }

export function unitPriceTtc(line: { qty_litres: number; amount_ttc: number; unit_price?: number }): number {
  const q = Number(line.qty_litres || 0);
  return q > 0 ? Number(line.amount_ttc || 0) / q : Number(line.unit_price || 0);
}

export function summarize(lines: ProvisionLine[]) {
  const by = new Map<string, { stationId: string; productId: string; litres: number; amount: number; count: number }>();
  for (const l of lines) {
    const k = l.stationId + "|" + l.productId;
    const e = by.get(k) ?? { stationId: l.stationId, productId: l.productId, litres: 0, amount: 0, count: 0 };
    e.litres += l.litres; e.amount += l.amount; e.count += 1; by.set(k, e);
  }
  return [...by.values()];
}

/** Super / gasoil d'après le code ou le nom du produit ; null si autre produit. */
export function fuelOf(p?: { code?: string | null; name?: string | null }): "super" | "gasoil" | null {
  const t = `${p?.code ?? ""} ${p?.name ?? ""}`.toLowerCase();
  if (/gas|go\b|diesel/.test(t)) return "gasoil";
  if (/sup|ess|sp\b/.test(t)) return "super";
  return null;
}
