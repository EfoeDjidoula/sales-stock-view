import type { LucideIcon } from "lucide-react";
import { Gauge, Fuel, Truck, ShieldAlert, Contact, ShieldCheck, Settings2, LifeBuoy } from "lucide-react";

/** Pôle métier du menu latéral : regroupe des onglets existants (identifiants inchangés). */
export interface NavPole {
  id: string;
  /** Numéro affiché devant le pôle (null pour la zone basse). */
  number: number | null;
  label: string;
  icon: LucideIcon;
  tabs: string[];
}

/** Les 6 pôles métiers, dans l'ordre du processus. */
export const NAV_POLES: NavPole[] = [
  { id: "pilotage", number: 1, label: "Pilotage & Direction", icon: Gauge, tabs: ["command", "bi", "analyse_ia"] },
  { id: "exploitation", number: 2, label: "Exploitation & Stations", icon: Fuel, tabs: ["ventes", "ventes_cloture", "historique", "stations"] },
  { id: "stocks", number: 3, label: "Stocks & Logistique", icon: Truck, tabs: ["stock", "moteur_stock", "commandes", "logistique_avancee", "depotage"] },
  { id: "audit", number: 4, label: "Audit, Contrôle & Finance", icon: ShieldAlert, tabs: ["reconciliation", "anti_fraude", "perequation", "structure_prix"] },
  { id: "clients", number: 5, label: "Clients, B2B & Cartes", icon: Contact, tabs: ["clients", "b2b", "fuel_cards", "proforma", "fournisseurs"] },
  { id: "conformite", number: 6, label: "Conformité, Actifs & Reporting", icon: ShieldCheck, tabs: ["maintenance", "hse", "rapports", "suite_pro"] },
];

/** Zone basse du menu : administration et support, séparés des pôles métiers. */
export const NAV_FOOTER: NavPole[] = [
  { id: "admin", number: null, label: "Administration", icon: Settings2, tabs: ["workflows", "exercices", "droits", "societe"] },
  { id: "support", number: null, label: "Support", icon: LifeBuoy, tabs: ["support"] },
];

export const ALL_NAV_GROUPS: NavPole[] = [...NAV_POLES, ...NAV_FOOTER];

/** Pôle contenant un onglet (pour le fil d'Ariane et l'ouverture automatique). */
export const findPoleOfTab = (tab: string): NavPole | undefined =>
  ALL_NAV_GROUPS.find((g) => g.tabs.includes(tab));

/** Total des pastilles d'un pôle, limité aux onglets visibles. */
export const poleBadgeTotal = (pole: NavPole, badges: Record<string, number>, visible: (tab: string) => boolean) =>
  pole.tabs.filter(visible).reduce((sum, tab) => sum + (badges[tab] ?? 0), 0);

/** Affichage compact d'une pastille. */
export const formatBadge = (n: number) => (n > 99 ? "99+" : String(n));
