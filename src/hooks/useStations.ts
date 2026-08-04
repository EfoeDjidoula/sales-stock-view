import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export interface DbStation {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

export const useStations = () => {
  const [stations, setStations] = useState<DbStation[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenantId } = useTenant();

  const fetchStations = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");

      if (error) throw error;
      setStations(data || []);
    } catch (error) {
      console.error("Error fetching stations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return { stations, loading, refetch: fetchStations };
};
