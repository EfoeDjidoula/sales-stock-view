import { describe, it, expect } from "vitest";
import { rectifyPreview } from "./variance";

// Cas réel TRP-20261010-B04F5F : 5 compartiments, 10 500 L chargés, aucun compartiment confirmé sur site.
const loads = [
  { id: "c1", qty_litres: 2000 }, { id: "c2", qty_litres: 1500 }, { id: "c3", qty_litres: 3000 },
  { id: "c4", qty_litres: 3000 }, { id: "c5", qty_litres: 1000 },
];

describe("rectification d'une livraison", () => {
  it("nouveau livré = somme des compartiments saisis ; écart dans la tolérance de 0,5 %", () => {
    const p = rectifyPreview(loads, [], { c1: "2000", c2: "1500", c3: "2990", c4: "3000", c5: "980" }, 10500, 0.5);
    expect(p.total).toBe(10470);
    expect(p.variance).toBe(-30);
    expect(p.valid).toBe(true);
    expect(p.outOfTolerance).toBe(false); // 30 L ≤ 52,5 L
  });
  it("refuse une quantité supérieure au chargement du compartiment", () => {
    const p = rectifyPreview(loads, [], { c1: "2100", c2: "1500", c3: "3000", c4: "3000", c5: "1000" }, 10500, 0.5);
    expect(p.lines[0].error).toBe("over");
    expect(p.valid).toBe(false);
  });
  it("tous les compartiments non confirmés doivent être saisis", () => {
    const p = rectifyPreview(loads, [], { c1: "2000" }, 10500, 0.5);
    expect(p.complete).toBe(false);
    expect(p.valid).toBe(false);
  });
  it("les compartiments confirmés sur site restent figés et comptent dans le total", () => {
    const p = rectifyPreview(loads, [{ load_id: "c1", qty_delivered: 1990 }], { c1: "0", c2: "1500", c3: "3000", c4: "3000", c5: "1000" }, 10500, 0.5);
    expect(p.lines[0].confirmed).toBe(1990);
    expect(p.total).toBe(10490);
  });
  it("rien à rectifier quand tous les compartiments sont déjà confirmés", () => {
    const p = rectifyPreview(loads.slice(0, 1), [{ load_id: "c1", qty_delivered: 1900 }], {}, 2000, 0.5);
    expect(p.valid).toBe(false);
    expect(p.outOfTolerance).toBe(true);
  });
});
