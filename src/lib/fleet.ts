// Fleet helpers: vehicle kinds, towed units and compartment rows.
export const VEHICLE_KINDS: Record<string, [string, string]> = {
  truck: ["Camion porteur", "Rigid truck"],
  tractor: ["Tracteur", "Tractor"],
  tanker: ["Citerne", "Tanker"],
  semi_trailer: ["Semi-remorque citerne", "Tank semi-trailer"],
  trailer: ["Remorque citerne", "Tank trailer"],
};
export const TOWED_KINDS = ["tanker", "semi_trailer", "trailer"];
export const isTowed = (kind?: string) => !!kind && TOWED_KINDS.includes(kind);
/** Kinds that carry their own compartments (everything but the tractor). */
export const carriesLoad = (kind?: string) => !!kind && kind !== "tractor";

export type CompRow = { position: number; capacity_litres: number | ""; calibration_ref?: string; id?: string };

/** Resize the compartment rows to `count`, keeping already typed values. */
export function resizeCompartments(rows: CompRow[], count: number): CompRow[] {
  const n = Math.max(0, Math.min(12, Math.floor(count || 0)));
  return Array.from({ length: n }, (_, i) => rows[i] ?? { position: i + 1, capacity_litres: "" });
}

/** Errors for a compartment plan against the declared capacity (empty = ok). */
export function compartmentErrors(rows: CompRow[], capacity: number): string[] {
  const errs: string[] = [];
  if (rows.some((r) => r.capacity_litres === "" || Number(r.capacity_litres) <= 0)) errs.push("Chaque compartiment doit avoir une capacité positive.");
  const total = rows.reduce((s, r) => s + (Number(r.capacity_litres) || 0), 0);
  if (rows.length && capacity > 0 && total !== capacity) errs.push(`Total compartiments ${total} L ≠ capacité ${capacity} L.`);
  return errs;
}
