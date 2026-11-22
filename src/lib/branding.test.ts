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

describe("papier à en-tête PDF", () => {
  it("la raison sociale du pays actif est le titre, pas le nom commercial", async () => {
    const { letterheadLines } = await import("./pdfLetterhead");
    const b = applyCountryIdentity({ ...group, appDescription: "Suivi, gestion des stock et stations" }, { name: "Togo", legal_name: "YATT & CO ENERGY TOGO" });
    const l = letterheadLines(b);
    expect(l.title).toBe("YATT & CO ENERGY TOGO");
    expect(l.subtitle).toBe("Suivi, gestion des stock et stations");
    expect(l.detail).toBe("YATT & CO ENERGY  ·  Pays : Togo");
  });

  it("sans raison sociale propre au pays, le titre reprend celle de la société", async () => {
    const { letterheadLines } = await import("./pdfLetterhead");
    const l = letterheadLines(applyCountryIdentity(group, { name: "Côte d'Ivoire", legal_name: null }));
    expect(l.title).toBe("YATT & CO ENERGY");
    expect(l.detail).toBe("Pays : Côte d'Ivoire");
  });
});
