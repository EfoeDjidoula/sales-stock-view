import { describe, it, expect } from "vitest";
import { nozzleOutput, salesCascade, tankBalance, venteGlobale } from "./indexModel";

describe("modèle unifié de saisie des index", () => {
  it("sortie réelle = (index arrivée − index départ) − retour en cuve", () => {
    const r = nozzleOutput(71441.91, 71534.04, 20);
    expect(r.brut).toBeCloseTo(92.13, 2);
    expect(r.net).toBeCloseTo(72.13, 2);
    expect(r.retourInvalide).toBe(false);
  });

  it("refuse un retour en cuve supérieur au volume débité", () => {
    expect(nozzleOutput(100, 150, 60).retourInvalide).toBe(true);
  });

  it("vente globale = sorties réelles × prix Super 695 / Gasoil 720", () => {
    expect(venteGlobale(100, 200, 695, 720)).toBe(69500 + 144000);
  });

  it("montant à verser = vente globale − autoconso − bons clients − tickets valeur − cartes − Mobile Money", () => {
    const c = salesCascade(1_000_000, { autoconso: 50_000, bonsClients: 100_000, ticketsValeur: 20_000, cartes: 30_000, momo: 86_085 }, 702_060);
    expect(c.montantAVerser).toBe(713_915);
    expect(c.ecartVersement).toBe(702_060 - 713_915);
  });

  it("écart sur versement positif quand le versement banque dépasse le montant à verser", () => {
    const c = salesCascade(500_000, { autoconso: 0, bonsClients: 0, ticketsValeur: 0, cartes: 0, momo: 0 }, 510_000);
    expect(c.ecartVersement).toBe(10_000);
  });

  it("bilan cuve : stock clôture = ouverture + dépotage − sortie ; écart = jauge − stock clôture", () => {
    const b = tankBalance(572, 0, 232, 340);
    expect(b.stockCloture).toBe(340);
    expect(b.ecart).toBe(0);
    const b2 = tankBalance(1733, 5000, 428, 6280);
    expect(b2.stockCloture).toBe(6305);
    expect(b2.ecart).toBe(-25);
  });
});
