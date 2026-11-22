import { describe, it, expect } from "vitest";
import { loadingStage, matchesFilter } from "./loadingTracking";
const base = { qtyLoaded: 30000, qtyDelivered: null, sitesTotal: 2, sitesDone: 0, openVariance: false };
describe("loadingStage", () => {
  it("maps the 7 operational stages", () => {
    expect(loadingStage({ ...base, status: "planned" })).toBe("waiting");
    expect(loadingStage({ ...base, status: "loading" })).toBe("loading");
    expect(loadingStage({ ...base, status: "loaded" })).toBe("loaded");
    expect(loadingStage({ ...base, status: "in_transit" })).toBe("en_route");
    expect(loadingStage({ ...base, status: "unloading", sitesDone: 1 })).toBe("partial");
    expect(loadingStage({ ...base, status: "delivered", qtyDelivered: 29900, openVariance: true })).toBe("delivered");
    expect(loadingStage({ ...base, status: "delivered", qtyDelivered: 30000 })).toBe("closed");
  });
  it("arrived with no confirmed site stays en route", () => {
    expect(loadingStage({ ...base, status: "arrived" })).toBe("en_route");
  });
  it("justified variance closes the trip", () => {
    expect(loadingStage({ ...base, status: "delivered", qtyDelivered: 29900, openVariance: false })).toBe("closed");
  });
});
describe("matchesFilter", () => {
  const r = { date: "2026-11-20T08:00:00Z", depotId: "d1", vehicleIds: ["v1", "t1"], driverId: "c1", productIds: ["p1"], destIds: ["s1"], stage: "en_route" as const };
  it("filters by period and criteria", () => {
    expect(matchesFilter(r, { from: "2026-11-20", to: "2026-11-20" })).toBe(true);
    expect(matchesFilter(r, { from: "2026-11-21" })).toBe(false);
    expect(matchesFilter(r, { vehicleId: "t1", productId: "p1", destId: "s1", depotId: "d1" })).toBe(true);
    expect(matchesFilter(r, { driverId: "c2" })).toBe(false);
    expect(matchesFilter(r, { stage: "closed" })).toBe(false);
  });
});
