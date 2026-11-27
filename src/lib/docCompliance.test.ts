import { describe, it, expect } from "vitest";
import { docState, entityCompliance, documentReportRows, filterDocumentReport } from "./docCompliance";
const T = "2026-11-26";
describe("docCompliance", () => {
  it("expired before today", () => expect(docState("2026-11-25", T)).toBe("expired"));
  it("due soon within 30 days", () => expect(docState("2026-12-26", T)).toBe("due_soon"));
  it("valid after 30 days", () => expect(docState("2026-12-27", T)).toBe("valid"));
  it("urgent at exactly 15 days", () => expect(docState("2026-12-11", T)).toBe("urgent"));
  it("orange from 16 days", () => expect(docState("2026-12-12", T)).toBe("due_soon"));
  it("urgent on the expiry day", () => expect(docState(T, T)).toBe("urgent"));
  it("unknown expiry is never reported as valid", () => expect(docState("not-a-date", T)).toBe("missing"));
  it("the 15-day warning does not change loading eligibility", () => {
    expect(entityCompliance([{ vehicle_id: "v", doc_type: "Assurance", expires_on: "2026-12-11" }], "vehicle_id", "v", ["Assurance"], T).blocked).toBe(false);
  });
  it("reports every vehicle document and missing required pieces, without unscoped entities", () => {
    const rows = documentReportRows([
      { vehicle_id: "v", doc_type: "Assurance", doc_number: "A-1", expires_on: "2026-12-11" },
      { vehicle_id: "v", doc_type: "Certificat de jaugeage", expires_on: "2027-06-01" },
      { vehicle_id: "other-country", doc_type: "Assurance", expires_on: "2027-06-01" },
    ], [{ id: "v", registration: "BJ-123" }], [], T);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.number === "A-1")).toMatchObject({ name: "BJ-123", days: 15, state: "urgent" });
    expect(rows.filter((r) => r.missingDocument).map((r) => r.type).sort()).toEqual(["Carte grise", "Visite technique"]);
    expect(rows.some((r) => r.name === "other-country")).toBe(false);
  });
  it("driver exports honor group, state and search filters", () => {
    const rows = documentReportRows([{ driver_id: "d", doc_type: "Permis poids lourd", doc_number: "P-1", expires_on: "2026-12-26" }], [{ id: "v", registration: "BJ-123" }], [{ id: "d", full_name: "Koffi" }], T);
    expect(filterDocumentReport(rows, "drivers", "due_soon", "P-1")).toEqual([expect.objectContaining({ name: "Koffi", days: 30 })]);
    expect(filterDocumentReport(rows, "vehicles", "due_soon", "P-1")).toHaveLength(0);
  });
  it("missing required doc blocks the truck", () => {
    const r = entityCompliance([{ vehicle_id: "v", doc_type: "Assurance", expires_on: "2027-06-01" }], "vehicle_id", "v", ["Assurance", "Carte grise"], T);
    expect(r.worst).toBe("missing"); expect(r.blocked).toBe(true);
  });
  it("latest renewal is used", () => {
    const r = entityCompliance([{ driver_id: "d", doc_type: "Attestation ADR", expires_on: "2026-01-01" }, { driver_id: "d", doc_type: "Attestation ADR", expires_on: "2027-06-01" }], "driver_id", "d", ["Attestation ADR"], T);
    expect(r.worst).toBe("valid");
  });
});
