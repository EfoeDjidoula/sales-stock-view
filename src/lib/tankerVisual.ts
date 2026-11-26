export type FuelTone = "super" | "gasoil" | "accent" | "muted";

export const productTone = (name?: string): FuelTone => {
  const value = (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!value.trim()) return "muted";
  if (value.includes("gasoil") || value.includes("gazoile") || value.includes("diesel") || value.includes("gas-oil")) return "gasoil";
  if (value.includes("super") || value.includes("essence") || value.includes("petrol")) return "super";
  return "accent";
};

/** Fill ratio used by the drawing; invalid or excessive quantities never spill outside a compartment. */
export const compartmentFill = (qty: number | string, capacity: number) => {
  const cap = Number(capacity);
  const volume = Number(qty);
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(volume)) return 0;
  return Math.max(0, Math.min(1, volume / cap));
};
