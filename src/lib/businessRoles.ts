export type LegacyRole = "admin" | "manager" | "operator";

/** Rôle technique hérité dérivé du rôle métier (les droits réels viennent des permissions). */
const LEGACY: Record<string, LegacyRole> = {
  client_admin: "admin",
  country_director: "admin",
  ops_manager: "manager",
  sales_manager: "manager",
  station_manager: "manager",
  controller: "manager",
  auditor: "manager",
  gerant: "operator",
  operator: "operator",
  viewer: "operator",
};

export const legacyRoleFor = (code: string | null | undefined): LegacyRole =>
  (code && LEGACY[code]) || "operator";
