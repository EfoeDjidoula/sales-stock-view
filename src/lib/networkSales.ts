/** Bilan des ventes réseau : une ligne par station, mêmes formules que les récaps ECAP. */
import { salesLine, type SalesEntry } from "@/lib/ecap";

export interface NetworkEntry extends SalesEntry { station_id: string; status: string; banque_nom?: string | null }
export interface NetworkRow {
  station: string; jours: number; pending: number;
  vente: number; bonsSociete: number; bonsClients: number; tickets: number; cartes: number;
  venteReelle: number; momo: number; liquidite: number; verse: number; ecart: number; banques: string;
}
const r = (v: number) => Math.round(v * 100) / 100;

export function networkRow(station: string, entries: NetworkEntry[], from: string, to: string): NetworkRow {
  const l = salesLine(station, from, to, entries);
  const es = entries.filter((e) => e.entry_date >= from && e.entry_date <= to);
  const venteReelle = r(l.vente - l.bonsSociete - l.bonsClients - l.tickets - l.cartes);
  const liquidite = r(venteReelle - l.momo);
  const banques = [...new Set(es.map((e) => (e.banque_nom ?? "").trim()).filter(Boolean))].join(", ");
  return {
    station, jours: l.jours, pending: es.filter((e) => e.status !== "valide").length,
    vente: l.vente, bonsSociete: l.bonsSociete, bonsClients: l.bonsClients, tickets: l.tickets, cartes: l.cartes,
    venteReelle, momo: l.momo, liquidite, verse: l.versementBanque, ecart: r(l.versementBanque - liquidite), banques,
  };
}

export function networkTotal(rows: NetworkRow[]): NetworkRow {
  const s = (k: keyof NetworkRow) => r(rows.reduce((t, x) => t + (x[k] as number), 0));
  return {
    station: "TOTAL RÉSEAU", jours: s("jours"), pending: s("pending"), vente: s("vente"), bonsSociete: s("bonsSociete"),
    bonsClients: s("bonsClients"), tickets: s("tickets"), cartes: s("cartes"), venteReelle: s("venteReelle"), momo: s("momo"),
    liquidite: s("liquidite"), verse: s("verse"), ecart: s("ecart"), banques: "",
  };
}

export const NETWORK_HEADERS = ["Station", "Vente totale", "Bons société", "Bons clients & partenaires", "Tickets valeur", "Cartes prépayées", "Vente réelle", "MoMo Pay", "Liquidité", "Montant versé", "Écart", "Banque"];
export const networkCells = (x: NetworkRow): (string | number)[] =>
  [x.station, x.vente, x.bonsSociete, x.bonsClients, x.tickets, x.cartes, x.venteReelle, x.momo, x.liquidite, x.verse, x.ecart, x.banques];
