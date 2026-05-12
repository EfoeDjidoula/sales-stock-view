import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export const usePumps = (stationId?: string) => {
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPumps = async () => {
    setLoading(true);
    try {
      let q = supabase.from("pumps").select("*").order("position").order("name");
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      setPumps((data || []) as Pump[]);
    } catch (e) {
      console.error("Error fetching pumps:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPumps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);

  return { pumps, loading, refetch: fetchPumps };
};
