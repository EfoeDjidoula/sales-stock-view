import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useCountry } from "@/hooks/useCountry";
import { fallbackFuelPrices } from "@/config/prices";
import { priceResolver, type PriceStructure } from "@/lib/ecap";

/**
 * Prix de vente du pays de travail, pour les écrans.
 *
 * Même règle que les rapports : la structure de prix active en vigueur à la date
 * du jour; repli historique uniquement pour le Bénin (jamais pour un autre pays).
 * Lecture seule, scoupée tenant + pays, donc identique à ce que la RLS autorise.
 */
export const useCountryPrices = () => {
  const { tenantId, countryId, scopeQuery } = useScope();
  const { country } = useCountry();

  const q = useQuery({
    queryKey: ["country-price-structures", tenantId, countryId],
    enabled: !!tenantId && !!countryId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await scopeQuery(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("price_structures")
          .select("effective_date,super_price,gasoil_price")
          .eq("is_active", true)
          .order("effective_date")
      );
      if (error) throw error;
      return (data ?? []) as PriceStructure[];
    },
  });

  const structures = q.data ?? [];
  const priceOf = useMemo(
    () => priceResolver(structures, fallbackFuelPrices(country?.iso_code)),
    [structures, country?.iso_code]
  );

  return { priceOf, hasStructure: structures.length > 0, isLoading: q.isLoading };
};
