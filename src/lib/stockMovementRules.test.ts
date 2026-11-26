import { describe, expect, it } from "vitest";
import { isStockMovementQuantityValid } from "./stockMovementRules";

describe("quantité d'un mouvement de stock", () => {
  it("accepte un stock initial de 0 L pour matérialiser une cuve vide", () => {
    expect(isStockMovementQuantityValid("initial", 0)).toBe(true);
  });

  it("refuse 0 L pour une entrée, une sortie ou une vente", () => {
    expect(isStockMovementQuantityValid("entry", 0)).toBe(false);
    expect(isStockMovementQuantityValid("exit", 0)).toBe(false);
    expect(isStockMovementQuantityValid("sale", 0)).toBe(false);
  });

  it("refuse les quantités négatives, vides ou non numériques, y compris pour un stock initial", () => {
    expect(isStockMovementQuantityValid("initial", -1)).toBe(false);
    expect(isStockMovementQuantityValid("initial", "")).toBe(false);
    expect(isStockMovementQuantityValid("initial", "abc")).toBe(false);
  });

  it("conserve les inventaires à 0 L et les quantités positives", () => {
    expect(isStockMovementQuantityValid("inventory", 0)).toBe(true);
    expect(isStockMovementQuantityValid("initial", 2500)).toBe(true);
    expect(isStockMovementQuantityValid("entry", 100)).toBe(true);
  });
});
