import { describe, it, expect } from "vitest";
import { jsPDF, pdfSafeText } from "./pdf";

const amount = (1234567).toLocaleString("fr-FR");

describe("séparateurs de milliers dans les PDF", () => {
  it("remplace les espaces insécables par des espaces normales", () => {
    expect(pdfSafeText(amount)).toBe("1 234 567");
    expect(pdfSafeText(["12\u00A0500 F", amount])).toEqual(["12 500 F", "1 234 567"]);
  });

  it("écrit « 1 234 567 FCFA » lisible dans le PDF généré", () => {
    const doc = new jsPDF({ compress: false });
    doc.text(`Montant : ${amount} FCFA`, 10, 10);
    doc.text([`Total ${amount}`], 10, 20);
    const out = doc.output();
    expect(out).toContain("(Montant : 1 234 567 FCFA) Tj");
    expect(out).toContain("(Total 1 234 567) Tj");
    expect(out).not.toMatch(/1 \/234/);
  });
});

describe("papier à en-tête", () => {
  it("ajoute nom de la société et pied de page éditeur sur chaque page", async () => {
    const { setActiveBrand, DEFAULT_BRAND } = await import("./branding");
    setActiveBrand({ ...DEFAULT_BRAND, companyName: "YATT & CO ENERGY", taxId: "3201900000000", bankDetails: "BOA BJ061" });
    const doc = new jsPDF({ compress: false });
    doc.text("Contenu", 10, 10);
    doc.addPage();
    const out = doc.output();
    expect(out.match(/\(YATT & CO ENERGY\) Tj/g)?.length).toBe(2);
    expect(out).toContain("IFU : 3201900000000");
    expect(out).toContain("Banque : BOA BJ061");
    expect(out).toContain("(Page 2/2) Tj");
  });
});
