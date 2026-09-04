import { useCallback, useMemo } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";

/**
 * Portée active (société + pays).
 *
 * Les RLS Supabase appliquent déjà une isolation stricte côté base : ce helper
 * ne fait que refléter le contexte actif dans les requêtes du frontend afin de
 * n'afficher/écrire que les données du couple tenant_id + country_id courant.
 */
export const useScope = () => {
  const { tenantId } = useTenant();
  const { countryId } = useCountry();

  /** Ajoute les filtres tenant_id / country_id à une requête Supabase. */
  const scopeQuery = useCallback(
    <Q,>(query: Q): Q => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = query as any;
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (countryId) q = q.eq("country_id", countryId);
      return q as Q;
    },
    [tenantId, countryId]
  );

  /** Complète une ligne à insérer avec la portée active. */
  const scopeRow = useCallback(
    <T extends Record<string, unknown>>(row: T) => ({
      ...row,
      ...(tenantId ? { tenant_id: tenantId } : {}),
      ...(countryId ? { country_id: countryId } : {}),
    }),
    [tenantId, countryId]
  );

  return useMemo(
    () => ({ tenantId, countryId, scopeQuery, scopeRow, isScopeReady: !!tenantId }),
    [tenantId, countryId, scopeQuery, scopeRow]
  );
};
