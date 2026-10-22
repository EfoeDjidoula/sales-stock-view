import { describe, expect, it } from "vitest";
import { computeForecasts, shiftDay } from "./forecasting";
import type { Dataset } from "./index";

const data = (volume = 100): Dataset => ({
  stations: [{ id: "s1", name: "Station X", country_id: "bj", zone_id: null }],
  products: [{ id: "p1", code: "GASOIL" }], closures: [], closureSales: [], closurePayments: [], paymentMethods: [],
  entries: Array.from({ length: 37 }, (_, i) => ({ station_id: "s1", entry_date: shiftDay("2026-10-22", -37 + i), total_gasoil_liters: volume, total_super_liters: 0 })),
  levels: [{ station_id: "s1", tank_id: "t1", product_id: "p1", theoretical: 250, capacity: 1000, variance: 0, alert_level: "normal" }],
  recons: [], consumptions: [], invoices: [], payments: [], priceStructures: [], assets: [], workOrders: [], inspections: [], criticalNc: [],
});
const options = { asOf: "2026-10-22", historyDays: 30, horizon: 7 };
describe("prévisions déterministes", () => {
  it("risque de rupture dans 2,5 jours à 100 L/j pour 250 L de stock", () => {
    const [f] = computeForecasts(data(), options);
    expect(f.daysToRupture).toBe(2.5);
    expect(f.ruptureAt).toBe("2026-10-24T12:00:00.000Z");
    expect(f.consumption).toBe(700);
    expect(f.needLitres).toBe(450);
    expect(f.projections[2].stock).toBe(0);
  });
  it("ne transforme pas un historique absent en zéro certain", () => {
    const [f] = computeForecasts({ ...data(), entries: [] }, options);
    expect(f.daily).toBeNull(); expect(f.confidence).toBe("insufficient"); expect(f.needLitres).toBeNull();
  });
  it("distingue jours absents et jours observés à zéro", () => {
    const d = data(); d.entries = d.entries.slice(-3); d.entries[0].total_gasoil_liters = 0;
    const [f] = computeForecasts(d, options);
    expect(f.observedDays).toBe(3); expect(f.daily).toBeCloseTo(200 / 3); expect(f.confidence).toBe("low");
  });
  it("exclut le jour incomplet, les dates futures et les index négatifs", () => {
    const d = data(); d.entries.push({ station_id: "s1", entry_date: "2026-10-22", total_gasoil_liters: 99999, total_super_liters: 0 });
    d.entries.at(-2)!.total_gasoil_liters = -100;
    const [f] = computeForecasts(d, options); expect(f.daily).toBe(100); expect(f.observedDays).toBe(29);
  });
  it("stock absent : pas de date de rupture inventée", () => {
    const d = data(); d.levels[0].theoretical = null;
    const [f] = computeForecasts(d, options); expect(f.stock).toBeNull(); expect(f.ruptureAt).toBeNull();
  });
  it("stock et consommation nuls ne produisent pas de division invalide", () => {
    expect(computeForecasts(data(0), options)[0].daysToRupture).toBeNull();
    const d = data(); d.levels[0].theoretical = 0;
    expect(computeForecasts(d, options)[0].daysToRupture).toBe(0);
  });
  it("comparaison sans fuite : prévision 100, réalisé 200", () => {
    const d = data(); d.entries.slice(-7).forEach((e) => { e.total_gasoil_liters = 200; });
    const [f] = computeForecasts(d, options);
    expect(f.backtest[0].predicted).toBe(100); expect(f.backtest[0].actual).toBe(200); expect(f.mae).toBe(100);
  });
  it("respecte station/produit et ne fusionne pas les carburants", () => {
    expect(computeForecasts(data(), { ...options, filters: { stationId: "other" } })).toEqual([]);
    expect(computeForecasts(data(), { ...options, filters: { kind: "super" } })).toEqual([]);
    expect(computeForecasts(data(), options)[0].kind).toBe("gasoil");
  });
});