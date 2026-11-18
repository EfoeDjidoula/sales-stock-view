import { describe, it, expect } from "vitest";
import { buildValidationChecks, type ValidationCheckInput } from "./indexValidationChecks";

const base: ValidationCheckInput = {
  ecartVersement: 0, versementBanque: 100000, bordereau: "288009",
  cartesDeclared: 35000, cartesReal: 35000, bonsDeclared: 0, bonsReal: 0,
  tanks: [{ name: "Cuve Super 1", ecart: 0, jauge: 12000 }],
  hasPumpDetail: true, priorPending: 0, closureStatus: null,
};

describe("contrôles avant validation N+1", () => {
  it("aucun contrôle quand tout concorde", () => {
    expect(buildValidationChecks(base)).toEqual([]);
  });
  it("une saisie antérieure non validée bloque la validation", () => {
    const c = buildValidationChecks({ ...base, priorPending: 1 });
    expect(c.find((x) => x.code === "prior")?.level).toBe("block");
  });
  it("signale un sous-versement", () => {
    const c = buildValidationChecks({ ...base, ecartVersement: -5000 });
    expect(c.find((x) => x.code === "versement")?.message).toContain("sous-versement");
  });
  it("signale des ventes par carte différentes des transactions Fuel Cards", () => {
    const c = buildValidationChecks({ ...base, cartesDeclared: 40000 });
    expect(c.some((x) => x.code === "cartes" && x.level === "warn")).toBe(true);
  });
  it("ne compare pas les cartes quand les transactions réelles sont indisponibles", () => {
    const c = buildValidationChecks({ ...base, cartesDeclared: 40000, cartesReal: null });
    expect(c.some((x) => x.code === "cartes")).toBe(false);
  });
  it("versement banque sans bordereau", () => {
    const c = buildValidationChecks({ ...base, bordereau: " " });
    expect(c.some((x) => x.code === "bordereau")).toBe(true);
  });
});
