import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";

export interface Tank {
  id: string;
  station_id: string;
  name: string;
  product_type: "super" | "gasoil";
  capacity_liters: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useTanks = (stationId?: string) => {
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId } = useTenant();
  const { countryId } = useCountry();

  const fetchTanks = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      let q = supabase.from("tanks").select("*").eq("tenant_id", tenantId).order("product_type").order("name");
      if (countryId) q = q.eq("country_id", countryId);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      setTanks((data || []) as Tank[]);
    } catch (e) {
      console.error("Error fetching tanks:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, tenantId, countryId]);

  return { tanks, loading, refetch: fetchTanks };
};
