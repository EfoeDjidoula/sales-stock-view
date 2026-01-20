import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DbStation {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

export const useStations = () => {
  const [stations, setStations] = useState<DbStation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
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
  }, []);

  return { stations, loading, refetch: fetchStations };
};
