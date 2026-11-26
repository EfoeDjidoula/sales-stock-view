import { describe, it, expect } from "vitest";
import { buildGlobalSheet, splitByStation } from "./globalStockSheet";

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
});
