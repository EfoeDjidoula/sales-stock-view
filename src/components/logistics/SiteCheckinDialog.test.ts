import { describe, it, expect } from "vitest";
import { siteProgress } from "./SiteCheckinDialog";

const loads = [
  { id: "a", destination_type: "station", station_id: "S1", qty_litres: 15000, stop_order: 1 },
  { id: "b", destination_type: "station", station_id: "S1", qty_litres: 15000, stop_order: 1 },
  { id: "c", destination_type: "client", client_id: "C1", qty_litres: 10000, stop_order: 2 },
];

describe("check-in des sites", () => {
  it("un site n'est livré que si tous ses compartiments sont validés", () => {
    const p = siteProgress(loads, [{ load_id: "a", qty_delivered: 15000 }]);
    expect(p.done).toBe(0);
    expect(p.allDelivered).toBe(false);
  });
  it("la livraison finale exige tous les sites et recalcule le total", () => {
    const p = siteProgress(loads, [{ load_id: "a", qty_delivered: 15000 }, { load_id: "b", qty_delivered: 14950 }, { load_id: "c", qty_delivered: 10000 }]);
    expect(p.allDelivered).toBe(true);
    expect(p.received).toBe(39950);
  });
});
