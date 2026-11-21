/**
 * Rectification / justification d'un écart de livraison (transport déjà livré).
 * Compartiments déjà confirmés sur site : quantités figées (preuve immuable) → l'écart se justifie.
 * Compartiments sans confirmation : quantité réellement livrée à saisir (≤ chargement du compartiment).
 * Nouveau livré = Σ confirmés + Σ saisis ; écart = livré − chargé ; hors tolérance si |écart| > chargé × tolérance %.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const VARIANCE_CATEGORIES: Record<string, [string, string]> = {
  perte_transport: ["Perte en cours de transport", "Transport loss"],
  erreur_saisie: ["Erreur de saisie", "Input error"],
  evaporation: ["Évaporation / température", "Evaporation / temperature"],
  fuite: ["Fuite constatée", "Leak found"],
  vol_suspecte: ["Vol suspecté (enquête)", "Suspected theft (investigation)"],
  autre: ["Autre", "Other"],
};

export interface RectifyLine { loadId: string; loaded: number; confirmed: number | null; input: number | null; error: string | null }
export interface RectifyPreview { lines: RectifyLine[]; total: number; variance: number; complete: boolean; valid: boolean; outOfTolerance: boolean }

const parse = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v.replace(",", ".")));

export function rectifyPreview(loads: Row[], deliveries: Row[], inputs: Record<string, string>, qtyLoaded: number, tolerancePct: number): RectifyPreview {
  const confirmed = new Map(deliveries.map((x) => [x.load_id, Number(x.qty_delivered)]));
  const lines: RectifyLine[] = loads.map((l) => {
    const loaded = Number(l.qty_litres) || 0;
    if (confirmed.has(l.id)) return { loadId: l.id, loaded, confirmed: confirmed.get(l.id)!, input: null, error: null };
    const input = parse(inputs[l.id]);
    const error = input == null ? "missing" : !Number.isFinite(input) || input < 0 ? "invalid" : input > loaded ? "over" : null;
    return { loadId: l.id, loaded, confirmed: null, input, error };
  });
  const total = lines.reduce((s, l) => s + (l.confirmed ?? (l.error ? 0 : l.input ?? 0)), 0);
  const variance = total - qtyLoaded;
  const editable = lines.filter((l) => l.confirmed == null);
  return {
    lines, total, variance,
    complete: editable.every((l) => l.input != null),
    valid: editable.length > 0 && editable.every((l) => !l.error),
    outOfTolerance: qtyLoaded > 0 && Math.abs(variance) > (qtyLoaded * tolerancePct) / 100,
  };
}
