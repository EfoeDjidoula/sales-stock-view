import { describe, expect, it } from "vitest";
import { networkRow } from "./networkSales";
const e = { station_id: "s", status: "valide", entry_date: "2026-11-25", vente_globale: 1000000, autoconso_montant: 50000, bons_clients_montant: 100000, tickets_valeur_montant: 20000, cartes_montant: 30000, versement_momo: 100000, versement_banque: 690000, banque_nom: "SGB" };
describe("bilan des ventes réseau", () => {
  it("vente réelle = vente − bons − tickets − cartes", () => expect(networkRow("A", [e], "2026-11-25", "2026-11-25").venteReelle).toBe(800000));
  it("liquidité = vente réelle − MoMo", () => expect(networkRow("A", [e], "2026-11-25", "2026-11-25").liquidite).toBe(700000));
  it("écart = versé − liquidité", () => expect(networkRow("A", [e], "2026-11-25", "2026-11-25").ecart).toBe(-10000));
});
