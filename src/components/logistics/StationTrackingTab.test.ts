import { describe, it, expect } from "vitest";
import { variancePct, DELIVERY_TOLERANCE_PCT } from "./StationTrackingTab";

describe("écart de livraison station", () => {
  it("calcule l'écart en % (10 000 chargés, 9 940 livrés = -0,6 %)", () => {
    expect(variancePct(10000, 9940)).toBeCloseTo(-0.6);
  });
  it("seuil d'alerte à ±0,5 %", () => {
    expect(DELIVERY_TOLERANCE_PCT).toBe(0.5);
    expect(Math.abs(variancePct(10000, 9960)) > DELIVERY_TOLERANCE_PCT).toBe(false);
  });
});
