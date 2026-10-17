import { describe, it, expect } from "vitest";
import { computeKpis, deltaPct, previousRange, unitMargin, buildSaleFacts, type Dataset } from "./index";

const base: Dataset = {
  stations: [{ id: "s1", name: "A", country_id: "bj", zone_id: null }],
  products: [{ id: "p1", code: "SUPER" }],
  closures: [{ id: "c1", station_id: "s1", closure_date: "2026-10-01", status: "validated" }, { id: "c2", station_id: "s1", closure_date: "2026-10-02", status: "rejected" }],
  closureSales: [{ closure_id: "c1", product_id: "p1", volume: 1000, amount: 750000 }, { closure_id: "c2", product_id: "p1", volume: 999, amount: 1 }],
  closurePayments: [], paymentMethods: [],
  entries: [{ station_id: "s1", entry_date: "2026-10-01", total_super_liters: 50, total_gasoil_liters: 0 }],
  levels: [{ station_id: "s1", tank_id: "t", product_id: "p1", theoretical: 2000, capacity: 10000, variance: 0, alert_level: "normal" }],
  recons: [], consumptions: [],
  invoices: [{ id: "i1", client_id: "k", amount: 700000, due_on: "2026-09-01" }],
  payments: [{ invoice_id: "i1", amount: 400000 }],
  priceStructures: [{ country_id: "bj", effective_date: "2026-01-01", is_active: true, elements: [{ label: "MARGE PETROLIER DISTRIBUTEUR", super: 45 }, { label: "MARGE DETAILLANT", super: 25 }] }],
  assets: [], workOrders: [], inspections: [], criticalNc: [],
};
const f = { start: "2026-10-01", end: "2026-10-02" };

describe("couche de métriques BI", () => {
  it("ventes : clôtures rejetées exclues, index ignorés les jours clôturés", () => {
    const k = computeKpis(base, f, "2026-10-02");
    expect(k.volume).toBe(1000);
    expect(k.amount).toBe(750000);
  });
  it("marge = (45 + 25) FCFA/L × volume", () => {
    expect(unitMargin(base, "bj", "super", "2026-10-01")).toBe(70);
    expect(computeKpis(base, f).margin).toBe(70000);
  });
  it("marge non disponible sans structure de prix", () => {
    expect(computeKpis({ ...base, priceStructures: [] }, f).margin).toBeNull();
  });
  it("rotation = volume / stock et couverture = stock / vente moyenne journalière", () => {
    const k = computeKpis(base, f);
    expect(k.rotation).toBe(0.5);
    expect(k.coverageDays).toBe(4);
  });
  it("créances = facturé − payé, en retard si échéance passée", () => {
    const k = computeKpis(base, f, "2026-10-02");
    expect(k.receivables).toBe(300000);
    expect(k.overdue).toBe(300000);
  });
  it("index utilisé si aucune clôture ce jour", () => {
    expect(buildSaleFacts({ ...base, closures: [] }, f)[0].volume).toBe(50);
  });
  it("période précédente et variation", () => {
    expect(previousRange("2026-10-08", "2026-10-14")).toEqual({ start: "2026-10-01", end: "2026-10-07" });
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(5, 0)).toBeNull();
  });
});
