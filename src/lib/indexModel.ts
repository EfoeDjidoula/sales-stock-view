/**
 * Modèle unifié de saisie des index (toutes stations).
 *
 * Pistolet : Volume brut = Index arrivée − Index départ ; Sortie réelle = Volume brut − Retour en cuve.
 * Ventes   : Vente globale = Σ sorties réelles × prix unitaire du produit.
 *            Montant à verser = Vente globale − (Autoconso + Bons clients + Tickets valeur + Cartes + Mobile Money).
 *            Écart sur versement = Versement banque − Montant à verser (négatif = manquant).
 * Cuve     : Stock clôture théorique = Stock ouverture + Dépotages validés − Sortie (pistolets reliés).
 *            Écart sur stock = Jauge du jour − Stock clôture théorique.
 *
 * Les mêmes formules sont recalculées côté serveur à l'enregistrement.
 */

export const num = (v: string | number | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export interface NozzleCalc {
  brut: number;
  retour: number;
  net: number;
  /** Retour en cuve supérieur au volume débité. */
  retourInvalide: boolean;
  /** Index arrivée inférieur à l'index départ. */
  indexInvalide: boolean;
}

export const nozzleOutput = (depart: number, arrivee: number, retour: number): NozzleCalc => {
  const indexInvalide = arrivee > 0 && arrivee < depart;
  const brut = Math.max(0, arrivee - depart);
  const r = Math.max(0, retour);
  const retourInvalide = r > brut + 1e-9;
  return { brut, retour: r, net: Math.max(0, brut - r), retourInvalide, indexInvalide };
};

export interface SalesDeductions {
  autoconso: number;
  bonsClients: number;
  ticketsValeur: number;
  cartes: number;
  momo: number;
}

export interface SalesCascade {
  venteGlobale: number;
  totalDeductions: number;
  montantAVerser: number;
  versementBanque: number;
  ecartVersement: number;
}

export const salesCascade = (venteGlobale: number, d: SalesDeductions, versementBanque: number): SalesCascade => {
  const totalDeductions = d.autoconso + d.bonsClients + d.ticketsValeur + d.cartes + d.momo;
  const montantAVerser = venteGlobale - totalDeductions;
  return {
    venteGlobale,
    totalDeductions,
    montantAVerser,
    versementBanque,
    ecartVersement: versementBanque - montantAVerser,
  };
};

export const venteGlobale = (superLiters: number, gasoilLiters: number, prixSuper: number, prixGasoil: number) =>
  Math.round((superLiters * prixSuper + gasoilLiters * prixGasoil) * 100) / 100;

export interface TankBalance {
  stockOuverture: number;
  depotage: number;
  sortie: number;
  stockCloture: number;
  jauge: number;
  ecart: number;
}

export const tankBalance = (stockOuverture: number, depotage: number, sortie: number, jauge: number): TankBalance => {
  const stockCloture = stockOuverture + depotage - sortie;
  return { stockOuverture, depotage, sortie, stockCloture, jauge, ecart: jauge - stockCloture };
};
