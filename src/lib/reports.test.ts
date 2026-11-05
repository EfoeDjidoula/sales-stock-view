import { describe, expect, it } from "vitest";
import { agedBalance, dailyFlash, logisticsSummary, salesByDay } from "./reports";

describe("rapports périodiques", () => {
  it("flash : clôture rejetée exclue, +100 % vs J-1", () => {
    const closures = [
      { id: "a", station_id: "s", closure_date: "2026-11-05", status: "validated" },
      { id: "b", station_id: "s", closure_date: "2026-11-04", status: "validated" },
      { id: "c", station_id: "s", closure_date: "2026-11-05", status: "rejected" },
    ];
    const sales = [
      { closure_id: "a", product_id: "S", volume: 100, amount: 69500 },
      { closure_id: "a", product_id: "G", volume: 100, amount: 72000 },
      { closure_id: "b", product_id: "S", volume: 100, amount: 70750 },
      { closure_id: "c", product_id: "S", volume: 999, amount: 999999 },
    ];
    const f = dailyFlash(salesByDay(closures, sales, (id) => (id === "S" ? "super" : "gasoil")), "2026-11-05");
    expect(f.cur).toEqual({ super: 100, gasoil: 100, amount: 141500 });
    expect(f.vsD1).toBe(100);
  });

  it("balance âgée : 45 jours de retard → tranche 31-60 j, facture soldée ignorée", () => {
    const r = agedBalance(
      [{ id: "i1", client_id: "c", amount: 700000, due_on: "2026-09-21" }, { id: "i2", client_id: "c", amount: 1000, due_on: null }],
      [{ invoice_id: "i1", amount: 400000 }, { invoice_id: "i2", amount: 1000 }],
      "2026-11-05",
    );
    expect(r.get("c")).toEqual({ notDue: 0, d0_30: 0, d31_60: 300000, d60p: 0, total: 300000 });
  });

  it("logistique : 10 500 L chargés, 10 480 livrés = −20 L", () => {
    const s = logisticsSummary([
      { status: "delivered", qty_loaded: 10500, qty_delivered: 10480, departed_at: "2026-11-01T08:00:00Z", delivered_at: "2026-11-01T14:00:00Z" },
      { status: "planned", qty_loaded: null, qty_delivered: null, departed_at: null, delivered_at: null },
    ]);
    expect(s.gap).toBe(-20);
    expect(s.rate).toBe(50);
    expect(s.avgHours).toBe(6);
  });
});
