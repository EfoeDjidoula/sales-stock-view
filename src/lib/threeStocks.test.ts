import { describe, it, expect } from "vitest";
import { supplyStocks, groupStocks } from "./threeStocks";

describe("3 stocks logistiques", () => {
  it("commande approuvée non enlevée = stock commandé ouvert", () => {
    const t = supplyStocks({ id: "a", status: "ordered", product: "Gasoil", qty_requested: 10000, qty_approved: 9000 });
    expect(t.openOrdered).toBe(9000); expect(t.inTransit).toBe(0);
  });
  it("chargé = en transit, écart dépôt = chargé − commandé", () => {
    const t = supplyStocks({ id: "b", status: "in_transit", product: "Super", qty_approved: 9000, qty_loaded: 8950 });
    expect(t.inTransit).toBe(8950); expect(t.openOrdered).toBe(0); expect(t.depotVariance).toBe(-50);
  });
  it("réception comptée au BL chargé, écart camion = jauge − BL", () => {
    const t = supplyStocks({ id: "c", status: "received", product: "Gasoil", qty_approved: 9000, qty_loaded: 9000, qty_received: 8970 });
    expect(t.receivedBL).toBe(9000); expect(t.receivedGauge).toBe(8970); expect(t.truckVariance).toBe(-30); expect(t.inTransit).toBe(0);
  });
  it("brouillons, rejets et annulations ignorés", () => {
    for (const s of ["draft", "submitted", "rejected", "cancelled"]) expect(supplyStocks({ id: s, status: s, product: "x", qty_requested: 5 }).count).toBe(0);
  });
  it("agrège par produit", () => {
    const g = groupStocks([
      { id: "1", status: "ordered", product: "Super", qty_approved: 1000 },
      { id: "2", status: "received", product: "Super", qty_approved: 2000, qty_loaded: 2000, qty_received: 1990 },
    ], (r) => r.product);
    const s = g.get("Super")!;
    expect(s.openOrdered).toBe(1000); expect(s.receivedBL).toBe(2000); expect(s.ordered).toBe(3000);
  });
});
