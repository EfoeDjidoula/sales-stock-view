import { describe, expect, it } from "vitest";
import { lineAmounts, orderCounters, planExcess, productBalances, proformaTotals, sumCounters } from "./depotSupply";

describe("approvisionnement dépôt", () => {
  it("calcule HT, taxes et TTC d'une ligne", () => {
    expect(lineAmounts({ qty_litres: 30000, unit_price: 550, tax_rate: 18 })).toEqual({ amount_ht: 16500000, tax_amount: 2970000, amount_ttc: 19470000 });
  });
  it("totalise un pro-forma multi-produits", () => {
    expect(proformaTotals([{ qty_litres: 10000, unit_price: 600, tax_rate: 0 }, { qty_litres: 5000, unit_price: 650, tax_rate: 10 }]).amount_ttc).toBe(9575000);
  });
  it("un BC non payé ne donne aucune quantité disponible à l'enlèvement", () => {
    expect(orderCounters([{ qty_litres: 30000 }], "non_paye")).toEqual({ ordered: 30000, authorized: 0, lifted: 0, available: 0 });
  });
  it("prêt/crédit et paiement direct autorisent la quantité commandée", () => {
    expect(orderCounters([{ qty_litres: 30000, qty_lifted: 0 }], "pret_credit").available).toBe(30000);
    expect(orderCounters([{ qty_litres: 30000, qty_lifted: 12000 }], "paiement_direct").available).toBe(18000);
  });
  it("les soldes s'additionnent sur plusieurs commandes successives", () => {
    const s = sumCounters([orderCounters([{ qty_litres: 20000, qty_lifted: 5000 }], "pret_credit"), orderCounters([{ qty_litres: 10000 }], "non_paye")]);
    expect(s).toEqual({ ordered: 30000, authorized: 20000, lifted: 5000, available: 15000 });
  });

});

describe("bons d'enlèvement", () => {
  const lines = [{ id: "l1", product_id: "gasoil", qty_litres: 30000, qty_lifted: 10000 }, { id: "l2", product_id: "super", qty_litres: 20000 }];
  it("un BC non payé ne laisse rien à enlever", () => {
    expect(productBalances(lines, "non_paye")).toEqual({ gasoil: 0, super: 0 });
  });
  it("le solde déduit les quantités déjà enlevées et les BE établis non signés", () => {
    const b = productBalances(lines, "pret_credit", [
      { proforma_line_id: "l1", qty_litres: 5000, status: "established" },
      { proforma_line_id: "l1", qty_litres: 8000, status: "cancelled" },
    ]);
    expect(b).toEqual({ gasoil: 15000, super: 20000 });
  });
  it("interdit un plan supérieur au solde du BC ou un produit absent du BC", () => {
    const b = productBalances(lines, "paiement_direct");
    expect(planExcess([{ product_id: "gasoil", qty_litres: 12000 }, { product_id: "gasoil", qty_litres: 9000 }], b)).toEqual([{ product_id: "gasoil", requested: 21000, available: 20000 }]);
    expect(planExcess([{ product_id: "petrole", qty_litres: 1000 }], b)).toEqual([{ product_id: "petrole", requested: 1000, available: 0 }]);
    expect(planExcess([{ product_id: "super", qty_litres: 20000 }], b)).toEqual([]);
  });
});
