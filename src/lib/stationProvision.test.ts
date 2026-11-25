import { describe, it, expect } from "vitest";
import { unitPriceTtc, summarize, fuelOf } from "./stationProvision";
describe("mise à disposition", () => {
  it("prix unitaire TTC = montant TTC / litres", () => { expect(unitPriceTtc({ qty_litres: 30000, amount_ttc: 18_000_000 })).toBe(600); });
  it("reconnaît super et gasoil", () => { expect(fuelOf({ code: "GO", name: "Gasoil" })).toBe("gasoil"); expect(fuelOf({ code: "SUP", name: "Super" })).toBe("super"); expect(fuelOf({ code: "PET", name: "Pétrole" })).toBeNull(); });
  it("cumule par station et produit", () => {
    const r = summarize([
      { stationId: "A", productId: "S", date: "2026-11-20", litres: 10000, unitPrice: 600, amount: 6_000_000, tripRef: "T1" },
      { stationId: "A", productId: "S", date: "2026-11-21", litres: 5000, unitPrice: 600, amount: 3_000_000, tripRef: "T2" },
    ]);
    expect(r).toEqual([{ stationId: "A", productId: "S", litres: 15000, amount: 9_000_000, count: 2 }]);
  });
});
