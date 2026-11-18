import { beforeEach, describe, expect, it } from "vitest";
import { isNetworkError, offlineOps, registerOfflineHandler, replayOfflineOps } from "./offlineQueue";

describe("offline queue", () => {
  beforeEach(() => localStorage.clear());

  it("keeps only the latest version of the same station-day entry", () => {
    offlineOps.add({ kind: "index_entry", label: "A", userId: "u1", payload: { v: 1 } }, "st1:2026-11-18");
    offlineOps.add({ kind: "index_entry", label: "A", userId: "u1", payload: { v: 2 } }, "st1:2026-11-18");
    const items = offlineOps.list("u1");
    expect(items).toHaveLength(1);
    expect(items[0].payload.v).toBe(2);
  });

  it("only replays the signed-in user's entries", async () => {
    const seen: string[] = [];
    registerOfflineHandler("index_entry", async (op) => { seen.push(op.userId); });
    offlineOps.add({ kind: "index_entry", label: "A", userId: "u1", payload: {} });
    offlineOps.add({ kind: "index_entry", label: "B", userId: "u2", payload: {} });
    const res = await replayOfflineOps("u1");
    expect(res.sent).toBe(1);
    expect(seen).toEqual(["u1"]);
    expect(offlineOps.list("u2")).toHaveLength(1);
  });

  it("keeps a refused entry with its reason instead of dropping it", async () => {
    registerOfflineHandler("supply_receive", async () => { throw new Error("Saisie déjà validée"); });
    offlineOps.add({ kind: "supply_receive", label: "R", userId: "u1", payload: {} });
    const res = await replayOfflineOps("u1");
    expect(res.failed).toBe(1);
    expect(offlineOps.list("u1")[0].error).toBe("Saisie déjà validée");
  });

  it("recognises a lost connection but not a business refusal", () => {
    expect(isNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isNetworkError(new Error("Permission refusée"))).toBe(false);
  });
});
