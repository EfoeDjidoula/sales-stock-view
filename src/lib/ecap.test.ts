import { describe, it, expect } from "vitest";
import { dailyLines, interleaveFuels, inventoryCash, inventoryTanks, monthOf, priceResolver, pumpRecap, salesLine, voucherRecap, weekOf, weeklyLines, type PumpEntryRow, type SalesEntry } from "./ecap";

const price = priceResolver(
  [{ effective_date: "2026-11-01", super_price: 695, gasoil_price: 720 }, { effective_date: "2026-11-18", super_price: 700, gasoil_price: 0 }],
  { super: 650, gasoil: 680 },
);
const p = (entry_date: string, pump_id: string, product_type: string, d: number, a: number, r = 0): PumpEntryRow =>
  ({ entry_date, pump_id, product_type, index_depart: d, index_arrivee: a, retour_cuve: r });

describe("prix du jour", () => {
  it("prend la structure en vigueur à la date, sinon le prix par défaut", () => {
    expect(price("2026-10-31", "super")).toBe(650);
    expect(price("2026-11-17", "super")).toBe(695);
    expect(price("2026-11-18", "super")).toBe(700);
    expect(price("2026-11-18", "gasoil")).toBe(720); // prix gasoil nul ignoré
  });
});

describe("récap pistolets", () => {
  const names = new Map([["S1", "S1"], ["S2", "S2"], ["G1", "G1"]]);
  const r = pumpRecap([
    p("2026-11-17", "S1", "super", 1000, 1100, 10), p("2026-11-18", "S1", "super", 1100, 1300),
    p("2026-11-17", "G1", "gasoil", 50, 150), p("2026-11-17", "S2", "super", 0, 0),
  ], names, price);
  it("index départ du premier jour, arrivée du dernier jour, sortie réelle = sortie − retour", () => {
    const s1 = r.lines.find((l) => l.pumpId === "S1")!;
    expect([s1.indexDepart, s1.indexArrivee, s1.sortie, s1.retour, s1.net]).toEqual([1000, 1300, 300, 10, 290]);
  });
  it("montant = sortie réelle du jour × prix du jour", () => {
    expect(r.lines.find((l) => l.pumpId === "S1")!.montant).toBe(90 * 695 + 200 * 700);
    expect(r.fuels.super.puVariable).toBe(true);
    expect(r.fuels.gasoil).toEqual({ cumul: 100, montant: 72000, pu: 720, puVariable: false });
  });
  it("range le Super avant le Gasoil et alterne S/G pour l'inventaire", () => {
    expect(r.lines.map((l) => l.pumpId)).toEqual(["S1", "S2", "G1"]);
    expect(interleaveFuels(r.lines).map((l) => l.pumpId)).toEqual(["S1", "G1", "S2"]);
  });
});

const e = (entry_date: string, o: Partial<SalesEntry> = {}): SalesEntry => ({
  entry_date, vente_globale: 1_000_000, autoconso_montant: 10_000, bons_clients_montant: 20_000, tickets_valeur_montant: 5_000,
  cartes_montant: 15_000, versement_momo: 100_000, versement_banque: 849_000, ...o,
});

describe("ventes et versements", () => {
  it("à verser = vente − bons − tickets − cartes − MoMo ; écart = banque − à verser", () => {
    const l = salesLine("x", "2026-11-16", "2026-11-16", [e("2026-11-16")]);
    expect(l.aVerser).toBe(850_000);
    expect(l.ecart).toBe(-1_000);
  });
  it("une ligne par jour, jours sans saisie à zéro", () => {
    const rows = dailyLines([e("2026-11-16"), e("2026-11-18")], "2026-11-16", "2026-11-22");
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.jours)).toEqual([1, 0, 1, 0, 0, 0, 0]);
  });
  it("mensuel : semaines lundi–dimanche coupées en fin de mois", () => {
    const m = monthOf("2026-11");
    expect(m).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(weeklyLines([], m.from, m.to).map((w) => w.label)).toEqual(["01/11/26", "02-08/11/26", "09-15/11/26", "16-22/11/26", "23-29/11/26", "30/11/26"]);
  });
  it("récap bons : (bons + tickets + cartes + MoMo + banque) − vente = écart de versement", () => {
    const t = salesLine("T", "2026-11-16", "2026-11-22", [e("2026-11-16"), e("2026-11-17")]);
    const v = voucherRecap(t);
    expect(v.totalDeductions).toBe(300_000);
    expect(v.ecart).toBe(t.ecart);
  });
  it("semaine du lundi au dimanche contenant la date", () => {
    expect(weekOf("2026-11-21")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(weekOf("2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });
});

describe("fiche d'inventaire", () => {
  it("cuve : théorique = départ + dépotage − sorties ; écart = jauge − théorique = sorties − sortie sur cuve", () => {
    const [t] = inventoryTanks([{ id: "T", name: "CUVE SUPER", product_type: "super" }], [
      { entry_date: "2026-11-17", tank_id: "T", stock_ouverture: 10000, depotage: 9000, sortie: 3000, jauge: 15990 },
      { entry_date: "2026-11-18", tank_id: "T", stock_ouverture: 15990, depotage: 0, sortie: 2500, jauge: 13480 },
    ]);
    expect([t.depart, t.depotage, t.sortieIndex, t.theorique, t.jauge]).toEqual([10000, 9000, 5500, 13500, 13480]);
    expect(t.ecart).toBe(-20);
    expect(t.sortieCuve).toBe(5520);
    expect(t.ecart).toBe(t.sortieIndex - t.sortieCuve);
  });
  it("dépotages au volume BL des réceptions validées (repli sur le volume constaté sans BL)", () => {
    const [t] = inventoryTanks([{ id: "T", name: "CUVE GASOIL 2", product_type: "gasoil" }],
      [{ entry_date: "2026-11-18", tank_id: "T", stock_ouverture: 42, depotage: 3010, sortie: 777.18, jauge: 2318 }],
      [{ date: "2026-11-18", tank_id: "T", qty_loaded: 3000, qty_received: 3010 }, { date: "2026-11-18", tank_id: "X", qty_loaded: 500, qty_received: 500 }]);
    expect(t.depotage).toBe(3000);
    expect(t.ecart).toBe(53.18); // 2318 − (42 + 3000 − 777,18)
  });
  it("caisse : liquidité vendue = montant − bons − monétique ; écart = espèces comptées − liquidité", () => {
    const t = salesLine("T", "2026-11-16", "2026-11-16", [e("2026-11-16")]);
    const c = inventoryCash(1_000_000, t, 849_500);
    expect(c.liquidite).toBe(850_000);
    expect(c.ecart).toBe(-500);
  });
});
