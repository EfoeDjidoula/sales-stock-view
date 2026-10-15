import { describe, it, expect } from "vitest";
import { complianceScore } from "./hse";

const base = { lastInspectionScore: 100, openCriticalNc: 0, safetyItemsTotal: 4, safetyItemsExpired: 0, openActions: 0, overdueActions: 0, daysSinceFireDrill: 30 };

describe("compliance score", () => {
  it("is 100 when everything is compliant", () => expect(complianceScore(base).score).toBe(100));
  it("removes 25 pts of the critical factor per open critical NC", () =>
    expect(complianceScore({ ...base, openCriticalNc: 2 }).score).toBe(88));
  it("drops the fire drill factor after 180 days", () =>
    expect(complianceScore({ ...base, daysSinceFireDrill: 181 }).score).toBe(90));
});
