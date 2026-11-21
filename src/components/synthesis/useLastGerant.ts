import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Gérant en poste d'après le dernier arrêté des comptes validé de la station (gérant entrant si passation). */
export function useLastGerant(stationId: string) {
  const { tenantId, countryId, scopeQuery } = useScope();
  return useQuery({
    queryKey: ["last-gerant", tenantId, countryId, stationId],
    enabled: !!tenantId && !!stationId,
    queryFn: async () => {
      const { data } = await scopeQuery(db.from("account_closings").select("gerant,gerant_entrant"))
        .eq("station_id", stationId).eq("status", "valide").order("control_date", { ascending: false }).limit(1);
      const a = (data ?? [])[0] as { gerant: string; gerant_entrant: string | null } | undefined;
      return a ? a.gerant_entrant || a.gerant : "";
    },
  });
}
