import { describe, it, expect } from "vitest";
import { resizeCompartments, compartmentErrors, isTowed } from "./fleet";
describe("fleet", () => {
  it("shows as many compartment rows as the count typed", () => {
    expect(resizeCompartments([], 5)).toHaveLength(5);
    expect(resizeCompartments([], 8).map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("keeps typed values when the count changes", () => {
    const r = resizeCompartments([{ position: 1, capacity_litres: 10000 }], 2);
    expect(r[0].capacity_litres).toBe(10000);
  });
  it("requires compartments to sum to the capacity", () => {
    expect(compartmentErrors([{ position: 1, capacity_litres: 20000 }, { position: 2, capacity_litres: 10000 }], 30000)).toEqual([]);
    expect(compartmentErrors([{ position: 1, capacity_litres: 20000 }], 30000)).toHaveLength(1);
  });
  it("trailers and semi-trailers are towed units", () => {
    expect(isTowed("semi_trailer")).toBe(true);
    expect(isTowed("trailer")).toBe(true);
    expect(isTowed("tractor")).toBe(false);
  });
});
