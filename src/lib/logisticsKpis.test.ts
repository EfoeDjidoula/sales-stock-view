import { describe, it, expect } from "vitest";
import { lossBy, execution, stockSheet, rotation } from "./logisticsKpis";

describe("logistics KPIs", () => {
  it("loss % = (BL − jaugé) / BL par transporteur", () => {
    const r = lossBy([{ trip_id: "t", product_id: "p", station_id: "s", qty_bl: 10000, qty_measured: 9950, created_at: "" }], [{ id: "t", carrier_id: "c" }], "carrier_id");
    expect(r[0]).toMatchObject({ id: "c", loss: 50 });
    expect(r[0].lossPct).toBeCloseTo(0.5);
  });
  it("taux d'exécution commandé / enlevé / livré", () => {
    expect(execution(30000, 20000, 15000)).toMatchObject({ notLifted: 10000, inTransit: 5000 });
    expect(execution(30000, 20000, 15000).deliveredPct).toBeCloseTo(50);
  });
  it("fiche de stock : commandé → transit → réceptionné", () => {
    const s = stockSheet([
      { date: "2026-11-02", kind: "discharge", ref: "D", product_id: "p", qty: 10000 },
      { date: "2026-11-01", kind: "order", ref: "BC", product_id: "p", qty: 30000 },
      { date: "2026-11-01", kind: "lifting", ref: "BE", product_id: "p", qty: 10000 },
    ]);
    expect(s.at(-1)).toMatchObject({ notLifted: 20000, transit: 0, received: 10000 });
  });
  it("délai moyen BE → chargement en heures", () => {
    const r = rotation([{ trip_id: "t", created_at: "2026-11-01T08:00:00Z" }], [{ id: "t", loaded_at: "2026-11-01T14:00:00Z" }], []);
    expect(r.beToLoad).toBe(6);
  });
});
