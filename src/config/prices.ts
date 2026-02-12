/**
 * Pricing configuration for fuel products
 * These prices are used for calculating sales amounts across the application
 */

export const FUEL_PRICES = {
  SUPER: 695, // FCFA per liter
  GASOIL: 720, // FCFA per liter
} as const;

export type FuelType = keyof typeof FUEL_PRICES;

export const getFuelPrice = (fuelType: FuelType): number => {
  return FUEL_PRICES[fuelType];
};
