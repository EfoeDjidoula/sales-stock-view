import { describe, it, expect } from "vitest";
import { sortNozzles } from "./nozzleOrder";

describe("sortNozzles", () => {
  it("keeps every nozzle (no 4-nozzle cap), super first, natural order", () => {
    const names = ["G5", "S10", "G1", "S2", "S5", "S1", "G4", "S3", "S4", "G2", "G3"];
    const rows = names.map((n) => ({ name: n, product_type: n.startsWith("S") ? "super" : "gasoil" }));
    expect(sortNozzles(rows).map((r) => r.name)).toEqual(["S1", "S2", "S3", "S4", "S5", "S10", "G1", "G2", "G3", "G4", "G5"]);
  });
});
