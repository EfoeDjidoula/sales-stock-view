import { describe, expect, it } from "vitest";
import { creditSummary, invoiceState } from "./clientPortal";

describe("client portal credit", () => {
  it("available credit is limit minus outstanding", () => {
    expect(creditSummary(1_000_000, 335_000)).toEqual({ limit: 1_000_000, exposure: 335_000, available: 665_000, usedPct: 33.5 });
  });
  it("never shows negative available credit when over the limit", () => {
    const s = creditSummary(500_000, 650_000);
    expect(s.available).toBe(0);
    expect(s.usedPct).toBe(100);
  });
  it("without a contract there is no limit to show", () => {
    expect(creditSummary(null, 1000).available).toBeNull();
  });
});

describe("client portal invoices", () => {
  it("an unpaid invoice past its due date is overdue", () => {
    expect(invoiceState({ amount: 700_000, paid: 400_000, due_on: "2026-11-10" }, "2026-11-18")).toBe("overdue");
    expect(invoiceState({ amount: 700_000, paid: 700_000, due_on: "2026-11-10" }, "2026-11-18")).toBe("paid");
    expect(invoiceState({ amount: 700_000, paid: 0, due_on: "2026-12-10" }, "2026-11-18")).toBe("due");
  });
});
