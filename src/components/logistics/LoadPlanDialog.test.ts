import { describe, it, expect } from "vitest";
import { planTotals } from "./LoadPlanDialog";

describe("plan de chargement", () => {
  it("exige le volume total du camion", () => {
    expect(planTotals([{ qty_litres: 20000 }, { qty_litres: 15000 }], 40000).full).toBe(false);
    expect(planTotals([{ qty_litres: 20000 }, { qty_litres: 20000 }], 40000).full).toBe(true);
  });
});
