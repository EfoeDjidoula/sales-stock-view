/** Référentiel d'affichage des workflows d'approbation (les règles sont appliquées côté serveur). */
export const WORKFLOW_MODULES: Record<string, string> = {
  stock: "Stock",
  sales: "Ventes",
  clients: "Clients B2B",
  fuel_cards: "Cartes carburant",
  orders: "Commandes",
  supplies: "Approvisionnement",
  price_structures: "Prix & remises",
  stations: "Stations",
};

export const WORKFLOW_OPERATIONS: { code: string; label: string; module: string }[] = [
  { code: "stock_adjustment", label: "Ajustement de stock", module: "stock" },
  { code: "stock_transfer", label: "Transfert de stock", module: "stock" },
  { code: "closure_reopen", label: "Réouverture de clôture", module: "sales" },
  { code: "exceptional_discount", label: "Remise commerciale exceptionnelle", module: "sales" },
  { code: "credit_limit_increase", label: "Augmentation plafond B2B", module: "clients" },
  { code: "credit_exception", label: "Dérogation de crédit", module: "clients" },
  { code: "card_limit_increase", label: "Augmentation plafond carte", module: "fuel_cards" },
  { code: "purchase_order", label: "Commande d'achat", module: "orders" },
  { code: "supply_request", label: "Demande d'approvisionnement", module: "supplies" },
  { code: "price_change", label: "Modification de prix", module: "price_structures" },
  { code: "other", label: "Autre opération", module: "*" },
];

export const operationLabel = (code: string) => WORKFLOW_OPERATIONS.find((o) => o.code === code)?.label ?? code;

export const WORKFLOW_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "" },
  submitted: { label: "Soumis", cls: "border-primary/50 text-primary" },
  approved: { label: "Approuvé", cls: "border-success/50 text-success" },
  rejected: { label: "Rejeté", cls: "border-destructive/50 text-destructive" },
  cancelled: { label: "Annulé", cls: "text-muted-foreground" },
  escalated: { label: "Escaladé", cls: "border-warning/50 text-warning" },
};
