import { describe, it, expect } from "vitest";
import { computeSupplyNeeds } from "./supplyPlanning";
import type { Dataset } from "./index";

const d = (theoretical: number, transit = 0): any => ({
  stations: [{ id: "s", name: "A", country_id: "bj", zone_id: null }], products: [{ id: "p", code: "SUPER" }],
  closures: [{ id: "c", station_id: "s", closure_date: "2026-10-01", status: "validated" }],
  closureSales: [{ closure_id: "c", product_id: "p", volume: 10000, amount: 0 }], closurePayments: [], paymentMethods: [], entries: [],
  levels: [{ station_id: "s", tank_id: "t", product_id: "p", theoretical, capacity: 20000, variance: 0, alert_level: "normal" }],
  recons: [], consumptions: [], invoices: [], payments: [], priceStructures: [], assets: [], workOrders: [], inspections: [], criticalNc: [],
  openSupplies: transit ? [{ station_id: "s", product_id: "p", status: "in_transit", qty_requested: transit, qty_approved: null, qty_loaded: null }] : [],
} satisfies Dataset & any);

describe("besoins d'approvisionnement", () => {
  it("couverture < 3 j : besoin = 95 % capacité − stock (10 000 L sur 10 j = 1 000 L/j)", () => {
    const [n] = computeSupplyNeeds(d(2000), "2026-09-22", "2026-10-01", 10);
    expect(n.coverageDays).toBe(2);
    expect(n.needLitres).toBe(17000);
    expect(n.urgency).toBe("faible");
  });
  it("stock suffisant (≥ 3 j) : aucun besoin", () => {
    expect(computeSupplyNeeds(d(5000), "2026-09-22", "2026-10-01", 10)).toHaveLength(0);
  });
  it("les approvisionnements en cours sont déduits", () => {
    expect(computeSupplyNeeds(d(500, 5000), "2026-09-22", "2026-10-01", 10)).toHaveLength(0);
  });
});
