import { describe, it, expect } from "vitest";
import { creditUsage, detectIntent } from "./context";

describe("assistant", () => {
  it("liste les clients à 80 % ou plus de leur plafond (dernière condition)", () => {
    const r = creditUsage(
      { clients: [{ id: "a", name: "A" }, { id: "b", name: "B" }], invoices: [{ id: "i1", client_id: "a", amount: 900, due_on: null }, { id: "i2", client_id: "b", amount: 790, due_on: null }], payments: [{ invoice_id: "i1", amount: 100 }] },
      [{ client_id: "a", credit_limit: 500, effective_at: "2026-01-01" }, { client_id: "a", credit_limit: 1000, effective_at: "2026-02-01" }, { client_id: "b", credit_limit: 1000, effective_at: "2026-01-01" }],
    );
    expect(r.map((x) => x.name)).toEqual(["A"]);
    expect(r[0].pct).toBe(80);
  });
  it("reconnaît les cas d'usage", () => {
    expect(detectIntent("Génère le rapport mensuel du Togo")).toBe("monthly");
    expect(detectIntent("Quels clients ont dépassé 80 % de leur plafond ?")).toBe("credit");
    expect(detectIntent("Quelles stations risquent une rupture ?")).toBe("rupture");
    expect(detectIntent("Quelles stations ont les plus gros écarts ?")).toBe("variances");
  });
});
