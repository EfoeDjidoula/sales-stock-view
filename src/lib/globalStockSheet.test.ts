import { describe, it, expect } from "vitest";
import { buildGlobalSheet, depotAvailable, splitByStation } from "./globalStockSheet";

describe("fiche globale produit", () => {
  it("fin de journée = départ + achats − enlèvements, report au jour suivant", () => {
    const p = [{ date: "2026-11-24", number: "A", proforma: "", depot: "", qty: 45000 }, { date: "2026-11-25", number: "B", proforma: "", depot: "", qty: 20000 }];
    const l = [{ date: "2026-11-25", number: "BE", truck: "", driver: "", qty: 39000, stations: [] }];
    const d = buildGlobalSheet(p, l, "2026-11-25", "2026-11-26");
    expect(d[0].opening).toBe(45000);
    expect(d[0].closing).toBe(26000);
    expect(d[1].opening).toBe(26000);
  });
  it("ventile un camion de 25 000 L par station", () => {
    expect(splitByStation(25000, [{ name: "Akassato", qty: 10000 }, { name: "Allada", qty: 15000 }])).toEqual([{ name: "Akassato", qty: 10000 }, { name: "Allada", qty: 15000 }]);
    expect(splitByStation(25000, [{ name: "Akassato", qty: 10000 }]).at(-1)).toEqual({ name: "Non ventilé", qty: 15000 });
  });
  it("stock dépôt réel = initial 10 000 + BC 45 000 − BE 39 000", () => {
    const p = [{ date: "2026-11-01", number: "Stock initial", proforma: "", depot: "", qty: 10000 }, { date: "2026-11-24", number: "A", proforma: "", depot: "", qty: 45000 }];
    const l = [{ date: "2026-11-25", number: "BE", truck: "", driver: "", qty: 39000, stations: [] }];
    expect(depotAvailable(p, l)).toBe(16000);
    expect(buildGlobalSheet(p, l, "2026-11-25", "2026-11-25")[0].opening).toBe(55000);
  });
});
