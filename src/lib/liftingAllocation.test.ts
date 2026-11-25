import { describe, it, expect } from "vitest";
import { allocateBe, worstStatus } from "./liftingAllocation";

const be = [{ product_id: "S", qty_litres: 20000 }, { product_id: "G", qty_litres: 10000 }];
describe("répartition BE/BL", () => {
  it("conforme quand BE = somme des BL", () => {
    const r = allocateBe(be, [{ id: "a", product_id: "S", qty_litres: 12000 }, { id: "b", product_id: "S", qty_litres: 8000 }, { id: "c", product_id: "G", qty_litres: 10000 }], [], false);
    expect(worstStatus(r)).toBe("conform");
  });
  it("non affecté quand des litres enlevés manquent sur les BL", () => {
    const r = allocateBe(be, [{ id: "a", product_id: "S", qty_litres: 15000 }, { id: "c", product_id: "G", qty_litres: 10000 }], [], false);
    expect(r.find((l) => l.productId === "S")?.status).toBe("unallocated");
  });
  it("surplus quand les BL dépassent le BE", () => {
    const r = allocateBe(be, [{ id: "a", product_id: "S", qty_litres: 20000 }, { id: "c", product_id: "G", qty_litres: 11000 }], [], false);
    expect(worstStatus(r)).toBe("surplus");
  });
  it("livré inférieur aux BL une fois le transport livré", () => {
    const r = allocateBe(be, [{ id: "a", product_id: "S", qty_litres: 20000 }, { id: "c", product_id: "G", qty_litres: 10000 }], [{ load_id: "a", qty_delivered: 19900 }, { load_id: "c", qty_delivered: 10000 }], true);
    expect(r.find((l) => l.productId === "S")?.status).toBe("short_delivered");
  });
});
