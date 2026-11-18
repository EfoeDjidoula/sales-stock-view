/** Shared labels and pure calculations for the B2B client portal. */
export const PORTAL_REQUEST_LABEL: Record<string, string> = {
  credit_limit: "Augmentation du plafond de crédit",
  card_unblock: "Déblocage de carte",
  other: "Autre demande",
};
export const PORTAL_STATUS_LABEL: Record<string, string> = { open: "En attente", accepted: "Acceptée", declined: "Refusée" };
export const CARD_STATUS_LABEL: Record<string, string> = { active: "Active", blocked: "Bloquée", expired: "Expirée", replaced: "Remplacée" };

export const formatMoney = (n: number, currency = "FCFA") =>
  `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\u202f|\u00a0/g, " ")} ${currency}`;

export interface CreditSummary { limit: number | null; exposure: number; available: number | null; usedPct: number | null }

/** Available credit and usage; no contract means no limit to show. */
export const creditSummary = (limit: number | null | undefined, exposure: number): CreditSummary => {
  const e = Math.max(0, Number(exposure) || 0);
  if (limit == null) return { limit: null, exposure: e, available: null, usedPct: null };
  const l = Number(limit);
  return { limit: l, exposure: e, available: Math.max(0, l - e), usedPct: l > 0 ? Math.min(100, Math.round((e / l) * 1000) / 10) : 100 };
};

export interface PortalInvoice { amount: number; paid: number; due_on: string | null }
export type InvoiceState = "paid" | "overdue" | "due";
export const invoiceState = (i: PortalInvoice, today: string): InvoiceState =>
  Number(i.paid) >= Number(i.amount) ? "paid" : i.due_on && i.due_on < today ? "overdue" : "due";
