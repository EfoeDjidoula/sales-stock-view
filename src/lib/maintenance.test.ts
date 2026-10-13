import { describe, it, expect } from "vitest";
import { availabilityPct, dueState } from "./maintenance";

const today = new Date(2026, 9, 13);
describe("maintenance rules", () => {
  it("overdue when due date passed", () => expect(dueState("2026-10-12", today)).toBe("overdue"));
  it("soon within 15 days", () => expect(dueState("2026-10-28", today)).toBe("soon"));
  it("ok beyond 15 days", () => expect(dueState("2026-10-29", today)).toBe("ok"));
  it("availability: 10 assets, 24h down over 30 days = 99.7%", () => expect(availabilityPct(10, 24, 30)).toBe(99.7));
});
