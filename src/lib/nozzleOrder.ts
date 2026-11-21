/** Ordre d'affichage des pistolets/cuves : Super avant Gasoil, puis tri naturel du nom (S1, S2 … S10). Aucun plafond de nombre. */
export function sortNozzles<T extends { name: string; product_type?: string | null }>(rows: T[]): T[] {
  const rank = (p?: string | null) => (p === "super" ? 0 : p === "gasoil" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a.product_type) - rank(b.product_type) || a.name.localeCompare(b.name, "fr", { numeric: true }));
}
