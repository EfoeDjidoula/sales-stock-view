import { describe, expect, it } from "vitest";
import { fallbackFuelPrices } from "./prices";

describe("prix de repli par pays", () => {
  it("garde les prix historiques du Bénin", () => {
    expect(fallbackFuelPrices("BJ")).toEqual({ super: 695, gasoil: 720 });
  });
  it("ne donne jamais les prix du Bénin au Togo", () => {
    expect(fallbackFuelPrices("TGO")).toEqual({ super: 0, gasoil: 0 });
  });
  it("ne donne jamais les prix du Bénin au Burkina ni à la Côte d'Ivoire", () => {
    expect(fallbackFuelPrices("RBF")).toEqual({ super: 0, gasoil: 0 });
    expect(fallbackFuelPrices("RCI")).toEqual({ super: 0, gasoil: 0 });
  });
});
