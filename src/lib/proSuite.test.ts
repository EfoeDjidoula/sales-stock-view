import { describe, it, expect } from "vitest";
import { volumeAt15, splitThermalLoss, closureEntries, journalBalanced, customerStatement } from "./proSuite";

describe("proSuite", () => {
  it("ramène 10 000 L de super à 30 °C à 9 820 L à 15 °C", () => {
    expect(volumeAt15(10000, 30, "super")).toBeCloseTo(9820, 5);
  });
  it("une baisse de température explique l'écart apparent sans perte réelle", () => {
    const loaded15 = volumeAt15(10000, 32, "gasoil");
    const received = loaded15 / (1 - 0.00083 * (25 - 15));
    const r = splitThermalLoss(10000, 32, received, 25, "gasoil");
    expect(r.apparentLoss).toBeGreaterThan(0);
    expect(r.realLoss).toBeCloseTo(0, 5);
  });
  it("une clôture génère une écriture équilibrée, impayé au compte client", () => {
    const lines = closureEntries({ date: "2026-11-01", ref: "C1", station: "A", amount: 100000 },
      [{ method: "Espèces", amount: 60000 }, { method: "Mobile Money", amount: 30000 }]);
    expect(journalBalanced(lines)).toBe(true);
    expect(lines.find((l) => l.account === "411000")?.debit).toBe(10000);
  });
  it("le relevé B2B calcule le solde restant", () => {
    const s = customerStatement([{ date: "2026-10-01", ref: "F1", amount: 700000 }], [{ date: "2026-10-10", ref: "P1", amount: 400000 }]);
    expect(s[s.length - 1].balance).toBe(300000);
  });
});
