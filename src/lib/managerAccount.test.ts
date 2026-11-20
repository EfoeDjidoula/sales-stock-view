import { describe, it, expect } from "vitest";
import { classifyVariance, stockBalance, pumpSummaries, financialBalance, missingDays, type TankReadingRow, type PumpRow, type ReceptionRow, type EntryRow } from "./managerAccount";

const reading = (entry_date: string, tank_id: string, o: number, dep: number, jauge: number, product_type = "super"): TankReadingRow =>
  ({ entry_date, tank_id, product_type, stock_ouverture: o, depotage: dep, sortie: 0, jauge, ecart: 0 });
const pump = (entry_date: string, pump_id: string, d: number, a: number, r = 0, product_type = "super"): PumpRow =>
  ({ entry_date, pump_id, product_type, index_depart: d, index_arrivee: a, retour_cuve: r });

describe("compte des gérants — bilan matières", () => {
  const readings = [reading("2026-11-15", "T1", 8923, 8922, 10421), reading("2026-11-16", "T1", 10421, 0, 989)];
  const pumps = [pump("2026-11-15", "P1", 1000, 8400, 100), pump("2026-11-16", "P1", 8400, 17800, 50)];
  const receptions: ReceptionRow[] = [
    { date: "2026-11-15", fuel: "super", qty_approved: 9000, qty_loaded: 9000, qty_delivered: 9000, qty_received: 8922 },
    { date: "2026-11-15", fuel: "gasoil", qty_approved: 3000, qty_loaded: 3000, qty_delivered: 3000, qty_received: 3000 },
  ];
  const b = stockBalance("super", readings, pumps, receptions, 0.3);

  it("prend le stock d'ouverture du premier jour et la jauge du dernier jour", () => {
    expect(b.stockInitial).toBe(8923);
    expect(b.stockPhysique).toBe(989);
  });

  it("ne compte que la quantité réceptionnée en cuve, jamais la commandée ni l'enlevée", () => {
    expect(b.receptions).toBe(8922);
    expect(b.commande).toBe(9000);
    expect(b.enleve).toBe(9000);
    expect(b.ecartTransport).toBe(-78);
  });

  it("calcule les ventes nettes des retours en cuve", () => {
    // (8400-1000-100) + (17800-8400-50) = 7300 + 9350
    expect(b.ventes).toBe(16650);
  });

  it("écart = stock physique − (stock initial + réceptions − ventes)", () => {
    expect(b.stockTheorique).toBe(8923 + 8922 - 16650);
    expect(b.ecart).toBe(989 - (8923 + 8922 - 16650));
  });
});

describe("seuil de tolérance saisi", () => {
  it("toléré si l'écart reste dans le seuil", () => expect(classifyVariance(-0.25, 0.3)).toBe("ok"));
  it("manquant au-delà du seuil", () => expect(classifyVariance(-0.31, 0.3)).toBe("manquant"));
  it("excédent au-delà du seuil", () => expect(classifyVariance(0.5, 0.3)).toBe("excedent"));
  it("non qualifiable sans ventes", () => expect(classifyVariance(null, 0.3)).toBe("na"));
});

describe("index par pompe", () => {
  it("index début = départ du premier jour, index fin = arrivée du dernier jour", () => {
    const [s] = pumpSummaries([pump("2026-11-16", "P1", 8400, 17800), pump("2026-11-15", "P1", 1000, 8400)]);
    expect(s.indexDebut).toBe(1000);
    expect(s.indexFin).toBe(17800);
    expect(s.jours).toBe(2);
  });
});

describe("bilan financier", () => {
  it("écart de versement = versement banque − montant à verser", () => {
    const e = (v: number, av: number, vb: number): EntryRow => ({ entry_date: "2026-11-15", status: "valide", vente_globale: v, autoconso_montant: 0, bons_clients_montant: 0, tickets_valeur_montant: 0, cartes_montant: 0, versement_momo: v - av, montant_a_verser: av, versement_banque: vb, ecart_versement: vb - av });
    const f = financialBalance([e(1000, 800, 790), e(500, 400, 405)]);
    expect(f.montantAVerser).toBe(1200);
    expect(f.ecartVersement).toBe(-5);
  });
});

describe("jours manquants", () => {
  it("liste les jours de la période sans saisie retenue", () => {
    expect(missingDays("2026-11-15", "2026-11-18", [{ entry_date: "2026-11-15" }, { entry_date: "2026-11-17" }])).toEqual(["2026-11-16", "2026-11-18"]);
  });
});
