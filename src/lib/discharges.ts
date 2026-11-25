// Phase 5 — dépotage par compartiment (lecture/affichage ; écriture uniquement via logistics_discharge).
export interface DischargeLoad { id: string; destination_type: string; station_id?: string | null; product_id: string; qty_litres: number }

/** Compartiments livrés à une station, confirmés et pas encore dépotés. */
export const pendingDischarges = <T extends DischargeLoad>(loads: T[], deliveredLoadIds: Set<string>, dischargedLoadIds: Set<string>): T[] =>
  loads.filter((l) => l.destination_type === "station" && !!l.station_id && deliveredLoadIds.has(l.id) && !dischargedLoadIds.has(l.id));

/** Volume jaugé = après − avant ; écart station = jaugé − BL (négatif = manquant). */
export const dischargeVariance = (qtyBl: number, before: number, after: number) => {
  const measured = after - before;
  return { measured, variance: measured - qtyBl, pct: qtyBl > 0 ? ((measured - qtyBl) / qtyBl) * 100 : 0 };
};

export const validGauges = (before: number, after: number, capacity?: number | null) =>
  Number.isFinite(before) && Number.isFinite(after) && before >= 0 && after >= before && (capacity == null || after <= capacity);
