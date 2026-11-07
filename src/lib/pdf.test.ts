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
    expect(out).not.toContain(" /");
  });
});
