import { describe, expect, it } from "vitest";
import { buildLookup, translateText } from "./domTranslator";

const lookup = buildLookup({
  "Saisie des index": "Meter entry",
  "Pré-enregistré": "Pre-recorded",
  "{x} saisies en attente": "{x} entries pending",
  "Statut : {x}": "Status: {x}",
});

describe("translateText", () => {
  it("translates exact French text and keeps surrounding spaces", () => {
    expect(translateText("  Saisie des index ", lookup)).toBe("  Meter entry ");
  });
  it("fills numbers into templates", () => {
    expect(translateText("12 saisies en attente", lookup)).toBe("12 entries pending");
  });
  it("translates captured values that are themselves known labels", () => {
    expect(translateText("Statut : Pré-enregistré", lookup)).toBe("Status: Pre-recorded");
  });
  it("leaves data such as station names untouched", () => {
    expect(translateText("FIDJROSSÈ", lookup)).toBeNull();
    expect(translateText("12 000", lookup)).toBeNull();
  });
});

describe("createDomTranslator", () => {
  it("translates split sentences and restores French on stop", async () => {
    const { createDomTranslator } = await import("./domTranslator");
    const root = document.createElement("div");
    const p = document.createElement("p");
    p.append(document.createTextNode("30"), document.createTextNode(" derniers jours"));
    const h = document.createElement("h2");
    h.textContent = "Saisie des index";
    root.append(p, h);
    document.body.append(root);
    const tr = createDomTranslator(root);
    tr.start(buildLookup({ "{x} derniers jours": "Last {x} days", "Saisie des index": "Meter entry" }));
    expect(p.textContent).toBe("Last 30 days");
    expect(h.textContent).toBe("Meter entry");
    tr.stop();
    expect(p.textContent).toBe("30 derniers jours");
    expect(h.textContent).toBe("Saisie des index");
    root.remove();
  });
});
