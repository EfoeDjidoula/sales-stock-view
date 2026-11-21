/**
 * Pricing configuration for fuel products.
 *
 * Les prix officiels viennent de la structure de prix active du pays de travail.
 * Les valeurs ci-dessous ne sont qu'un repli historique pour le Bénin : aucun
 * autre pays ne doit hériter des prix béninois.
 */

export const FUEL_PRICES = {
  SUPER: 695, // FCFA per liter (Bénin, repli historique)
  GASOIL: 720, // FCFA per liter (Bénin, repli historique)
} as const;

export type FuelType = keyof typeof FUEL_PRICES;

export const getFuelPrice = (fuelType: FuelType): number => {
  return FUEL_PRICES[fuelType];
};

const BENIN_CODES = new Set(["BJ", "BEN"]);

/**
 * Prix de repli quand aucune structure de prix n'est en vigueur :
 * les prix historiques uniquement pour le Bénin (ou si le pays est inconnu),
 * 0 pour tout autre pays (le rapport signale alors l'absence de structure).
 */
export const fallbackFuelPrices = (countryIso?: string | null): { super: number; gasoil: number } => {
  const iso = (countryIso || "").trim().toUpperCase();
  if (!iso || BENIN_CODES.has(iso)) return { super: FUEL_PRICES.SUPER, gasoil: FUEL_PRICES.GASOIL };
  return { super: 0, gasoil: 0 };
};
