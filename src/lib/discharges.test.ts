import { describe, it, expect } from "vitest";
import { pendingDischarges, dischargeVariance, validGauges } from "./discharges";

describe("dépotage par compartiment", () => {
  const loads = [
    { id: "a", destination_type: "station", station_id: "s", product_id: "p", qty_litres: 10000 },
    { id: "b", destination_type: "client", station_id: null, product_id: "p", qty_litres: 5000 },
    { id: "c", destination_type: "station", station_id: "s", product_id: "p", qty_litres: 8000 },
    { id: "d", destination_type: "station", station_id: "s", product_id: "p", qty_litres: 8000 },
  ];
  it("ne propose que les compartiments station confirmés et non dépotés", () => {
    expect(pendingDischarges(loads, new Set(["a", "b", "c"]), new Set(["c"])).map((l) => l.id)).toEqual(["a"]);
  });
  it("écart = jaugé − BL", () => {
    expect(dischargeVariance(10000, 2000, 11950)).toEqual({ measured: 9950, variance: -50, pct: -0.5 });
  });
  it("refuse jauge après < avant ou au-delà de la capacité", () => {
    expect(validGauges(500, 400)).toBe(false);
    expect(validGauges(0, 30001, 30000)).toBe(false);
    expect(validGauges(0, 30000, 30000)).toBe(true);
  });
});
