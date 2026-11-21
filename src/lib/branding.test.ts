import { describe, expect, it } from "vitest";
import { applyCountryIdentity, DEFAULT_BRAND } from "./branding";

const group = {
  ...DEFAULT_BRAND,
  companyName: "YATT & CO ENERGY",
  legalName: "YATT & CO ENERGY",
  email: "info@yattcoenergy.com",
  address: null,
  taxId: null,
};

describe("identité légale par pays sur les rapports", () => {
  it("la raison sociale et l'adresse du pays actif remplacent celles de la société", () => {
    const b = applyCountryIdentity(group, { legal_name: "YATT & CO ENERGY TOGO", address: "Lomé - TOGO", tax_id: "TG123" });
    expect(b.legalName).toBe("YATT & CO ENERGY TOGO");
    expect(b.address).toBe("Lomé - TOGO");
    expect(b.taxId).toBe("TG123");
  });

  it("un champ vide du pays reprend l'information de la société", () => {
    const b = applyCountryIdentity(group, { legal_name: "YATT & CO ENERGY BENIN SA", email: "  " });
    expect(b.email).toBe("info@yattcoenergy.com");
  });

  it("le nom commercial reste celui du groupe", () => {
    const b = applyCountryIdentity(group, { legal_name: "YATT & CO ENERGY BURKINA" });
    expect(b.companyName).toBe("YATT & CO ENERGY");
  });
});
