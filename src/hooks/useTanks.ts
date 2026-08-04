import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

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

  const fetchTanks = async () => {
    setLoading(true);
    try {
      let q = supabase.from("tanks").select("*").order("product_type").order("name");
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
  }, [stationId]);

  return { tanks, loading, refetch: fetchTanks };
};
