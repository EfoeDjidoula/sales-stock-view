import { describe, expect, it } from "vitest";
import { nextSignatureRole, signatureProgress, blDecision, type DeliveryNote, type BlSignature } from "./deliveryNotes";
const signature = (role: BlSignature["role"], decision = "signed"): BlSignature => ({ role, decision, signed_by: role, signer_name: role, signature_png: "", signed_at: "", reserves: null });
const note = (signatures: BlSignature[] = []) => ({ shipper_user: "logistics", carrier_user: "driver", consignee_user: "recipient", trip_status: "loaded", signatures } as DeliveryNote);
describe("BL three signatures", () => {
  it("requires logistics before driver", () => { expect(nextSignatureRole(note(), "driver")).toBeNull(); expect(nextSignatureRole(note(), "logistics")).toBe("shipper"); });
  it("requires driver before recipient", () => { expect(nextSignatureRole(note([signature("shipper")]), "recipient")).toBeNull(); expect(nextSignatureRole(note([signature("shipper")]), "driver")).toBe("carrier"); });
  it("only the designated recipient can sign third", () => { const n = note([signature("shipper"), signature("carrier")]); expect(nextSignatureRole(n,"recipient")).toBe("consignee"); expect(nextSignatureRole(n,"other")).toBeNull(); });
  it("counts exactly three unique visas", () => { expect(signatureProgress([signature("shipper"),signature("shipper"),signature("carrier")])).toBe(2); expect(signatureProgress([signature("shipper"),signature("carrier"),signature("consignee")])).toBe(3); });
  it("a refusal is never represented as received conforming", () => { expect(blDecision([signature("consignee","refused")])).toBe("refused"); });
  it("cancelled trips cannot be signed", () => { expect(nextSignatureRole({...note(),trip_status:"cancelled"},"logistics")).toBeNull(); });
});