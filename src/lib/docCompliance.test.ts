import { describe, it, expect } from "vitest";
import { docState, entityCompliance } from "./docCompliance";
const T = "2026-11-26";
describe("docCompliance", () => {
  it("expired before today", () => expect(docState("2026-11-25", T)).toBe("expired"));
  it("due soon within 30 days", () => expect(docState("2026-12-26", T)).toBe("due_soon"));
  it("valid after 30 days", () => expect(docState("2026-12-27", T)).toBe("valid"));
  it("missing required doc blocks the truck", () => {
    const r = entityCompliance([{ vehicle_id: "v", doc_type: "Assurance", expires_on: "2027-06-01" }], "vehicle_id", "v", ["Assurance", "Carte grise"], T);
    expect(r.worst).toBe("missing"); expect(r.blocked).toBe(true);
  });
  it("latest renewal is used", () => {
    const r = entityCompliance([{ driver_id: "d", doc_type: "Attestation ADR", expires_on: "2026-01-01" }, { driver_id: "d", doc_type: "Attestation ADR", expires_on: "2027-06-01" }], "driver_id", "d", ["Attestation ADR"], T);
    expect(r.worst).toBe("valid");
  });
});
