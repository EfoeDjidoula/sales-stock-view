import { describe, it, expect } from "vitest";
import { tankLines, weeklyPeriods, periodSales, monthlyDeliveries, valuation, type ClosingTank, type ClosingReading, type ClosingReception, type ClosingEntry } from "./accountClosing";

const tanks: ClosingTank[] = [
  { id: "G1", name: "CUVE GASOIL 1", product_type: "gasoil", station_id: "S" },
  { id: "SU", name: "CUVE SUPER", product_type: "super", station_id: "S" },
];
const rd = (entry_date: string, tank_id: string, o: number, sortie: number, jauge: number): ClosingReading =>
  ({ entry_date, station_id: "S", tank_id, stock_ouverture: o, sortie, jauge });
const readings = [rd("2026-05-01", "SU", 12410, 4000, 17410), rd("2026-05-02", "SU", 17410, 5000, 13037), rd("2026-05-01", "G1", 2171, 300, 1871)];
const receptions: ClosingReception[] = [
  { date: "2026-05-01", station_id: "S", tank_id: "SU", qty_loaded: 9000, qty_received: 8934 },
  { date: "2026-06-03", station_id: "S", tank_id: "SU", qty_loaded: null, qty_received: 500 },
];
const prices = { super: 725, gasoil: 750 };

describe("arrêté des comptes — bilan par cuve", () => {
  const lines = tankLines(tanks, readings, receptions, prices);
  const su = lines.find((l) => l.tankId === "SU")!;

  it("range le Super avant le Gasoil", () => {
    expect(lines.map((l) => l.tankId)).toEqual(["SU", "G1"]);
  });
  it("prend le stock d'ouverture du premier jour et la jauge du dernier jour", () => {
    expect(su.stockInitial).toBe(12410);
    expect(su.jauge).toBe(13037);
  });
  it("compte l'approvisionnement au volume BL, sinon au volume constaté", () => {
    expect(su.approv).toBe(9500);
  });
  it("écart = jauge − (stock initial + approv − sorties), valorisé au PU", () => {
    expect(su.theorique).toBe(12410 + 9500 - 9000);
    expect(su.ecart).toBe(13037 - (12410 + 9500 - 9000));
    expect(su.ecartValorise).toBe(su.ecart * 725);
  });
  it("balance : stock contrôle − (approvisionnement valorisé − ventes) = somme des écarts valorisés", () => {
    const sales = 9000 * 725 + 300 * 750;
    const v = valuation(lines, sales);
    expect(v.approvisionnement).toBe((12410 + 9500) * 725 + 2171 * 750);
    expect(v.ecart).toBeCloseTo(v.sommeEcartsValorises, 2);
  });
});

describe("arrêté des comptes — périodes et ventes", () => {
  it("coupe les semaines le dimanche et en fin de mois", () => {
    expect(weeklyPeriods("2026-05-01", "2026-05-12").map((p) => p.label)).toEqual(["01-03/05/26", "04-10/05/26", "11-12/05/26"]);
    expect(weeklyPeriods("2026-08-29", "2026-09-02").map((p) => p.label)).toEqual(["29-30/08/26", "31/08/26", "01-02/09/26"]);
  });
  it("vente réelle = montant − bons − tickets − cartes ; liquidité = vente réelle − MoMo ; écart = banque − liquidité", () => {
    const e: ClosingEntry = { entry_date: "2026-05-01", station_id: "S", vente_globale: 8582837, autoconso_montant: 0, bons_clients_montant: 0, tickets_valeur_montant: 0, cartes_montant: 11740, versement_momo: 1055610, versement_banque: 7515485 };
    const { rows, total } = periodSales([e], weeklyPeriods("2026-05-01", "2026-05-10"));
    expect(rows).toHaveLength(1);
    expect(rows[0].venteReelle).toBe(8571097);
    expect(rows[0].liquidite).toBe(7515487);
    expect(rows[0].ecart).toBe(-2);
    expect(total.montant).toBe(8582837);
  });
  it("regroupe les livraisons par mois avec le nombre de BL", () => {
    const { rows, total } = monthlyDeliveries(receptions, "2026-05-01", "2026-06-30");
    expect(rows.map((r) => [r.label, r.nbBl, r.byTank.SU])).toEqual([["MAI", 1, 9000], ["JUIN", 1, 500]]);
    expect(total.byTank.SU).toBe(9500);
  });
});
