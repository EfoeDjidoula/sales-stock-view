import { describe, expect, it } from "vitest";
import { nextSignatureRole, signatureProgress, blDecision, blQuantities, consigneeLabel, type DeliveryNote, type BlSignature } from "./deliveryNotes";
const signature = (role: BlSignature["role"], decision = "signed"): BlSignature => ({ role, decision, signed_by: role, signer_name: role, signature_png: "", signed_at: "", reserves: null });
const note = (signatures: BlSignature[] = []) => ({ shipper_user: "logistics", carrier_user: null, consignee_user: "recipient", trip_status: "loaded", signatures } as DeliveryNote);
describe("BL three signatures", () => {
  it("requires logistics before driver", () => { expect(nextSignatureRole(note(), "recipient")).toBeNull(); expect(nextSignatureRole(note(), "logistics")).toBe("shipper"); });
  it("driver signs without account on the recipient's or logistics device", () => {
    const n = note([signature("shipper")]);
    expect(nextSignatureRole(n, "recipient")).toBe("carrier");
    expect(nextSignatureRole(n, "logistics")).toBe("carrier");
    expect(nextSignatureRole(n, "other")).toBeNull();
    expect(nextSignatureRole(n, "station-manager", true)).toBe("carrier");
  });
  it("only the designated recipient can sign third", () => { const n = note([signature("shipper"), signature("carrier")]); expect(nextSignatureRole(n,"recipient")).toBe("consignee"); expect(nextSignatureRole(n,"other", true)).toBeNull(); });
  it("counts exactly three unique visas", () => { expect(signatureProgress([signature("shipper"),signature("shipper"),signature("carrier")])).toBe(2); expect(signatureProgress([signature("shipper"),signature("carrier"),signature("consignee")])).toBe(3); });
  it("a refusal is never represented as received conforming", () => { expect(blDecision([signature("consignee","refused")])).toBe("refused"); });
  it("cancelled trips cannot be signed", () => { expect(nextSignatureRole({...note(),trip_status:"cancelled"},"logistics")).toBeNull(); });
});
describe("BL quantities", () => {
  const snap = { lines: [{ load_id: "a", product: "SUPER", compartment: 1, litres: 5000 }, { load_id: "b", product: "GASOIL", compartment: 2, litres: 4000 }] } as DeliveryNote["snapshot"];
  it("driver variance = discharged − BL, negative when short", () => {
    const q = blQuantities({ snapshot: snap, received: { a: 4985, b: 4000 } });
    expect(q.lines[0].variance).toBe(-15); expect(q.lines[1].variance).toBe(0);
    expect(q.received).toBe(8985); expect(q.variance).toBe(-15); expect(q.complete).toBe(true);
  });
  it("no total variance until every compartment is discharged", () => {
    const q = blQuantities({ snapshot: snap, received: { a: 5010 } });
    expect(q.lines[0].variance).toBe(10); expect(q.lines[1].received).toBeNull(); expect(q.variance).toBeNull();
  });
  it("recipient is the station manager for stations, site manager otherwise", () => {
    expect(consigneeLabel({ station_id: "s" })).toBe("Gérant de station");
    expect(consigneeLabel({ station_id: null })).toBe("Responsable de site / chantier");
  });
});
