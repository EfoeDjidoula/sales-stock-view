import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";

export interface Pump {
  id: string;
  station_id: string;
  tank_id: string | null;
  name: string;
  product_type: "super" | "gasoil";
  position: number;
  created_at: string;
  updated_at: string;
}

/** Cached (and kept on the device) so the index entry screen also works without network. */
export const usePumps = (stationId?: string) => {
  const { tenantId } = useTenant();
  const { countryId } = useCountry();
  const q = useQuery({
    queryKey: ["pumps", tenantId, countryId ?? null, stationId ?? null],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase.from("pumps").select("*").eq("tenant_id", tenantId!).order("position").order("name");
      if (countryId) query = query.eq("country_id", countryId);
      if (stationId) query = query.eq("station_id", stationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Pump[];
    },
  });
  return { pumps: q.data ?? [], loading: q.isPending, refetch: async () => { await q.refetch(); } };
};
