import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PumpIndexEntry {
  id: string;
  entry_id: string;
  pump_id: string;
  tank_id: string | null;
  station_id: string;
  user_id: string;
  entry_date: string;
  product_type: "super" | "gasoil";
  index_depart: number;
  index_arrivee: number;
  liters_sold: number;
}

/** Existing pump entries for a station/date (to pre-fill when editing the same day). */
export const usePumpIndexEntries = (stationId?: string, entryDate?: string) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pump-index-entries", stationId, entryDate],
    queryFn: async () => {
      if (!stationId || !entryDate) return [] as PumpIndexEntry[];
      const { data, error } = await supabase
        .from("pump_index_entries")
        .select("*")
        .eq("station_id", stationId)
        .eq("entry_date", entryDate);
      if (error) throw error;
      return (data || []) as PumpIndexEntry[];
    },
    enabled: !!user && !!stationId && !!entryDate,
  });
};

/** For each pump, returns the most recent index_arrivee strictly before `beforeDate`. */
export const usePreviousPumpIndex = (
  stationId?: string,
  pumpIds?: string[],
  beforeDate?: string,
) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["previous-pump-index", stationId, beforeDate, (pumpIds || []).join(",")],
    queryFn: async () => {
      const map: Record<string, number> = {};
      if (!stationId || !beforeDate || !pumpIds?.length) return map;
      const { data, error } = await supabase
        .from("pump_index_entries")
        .select("pump_id, index_arrivee, entry_date")
        .eq("station_id", stationId)
        .in("pump_id", pumpIds)
        .lt("entry_date", beforeDate)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      for (const row of data || []) {
        if (!(row.pump_id in map)) map[row.pump_id] = Number(row.index_arrivee) || 0;
      }
      return map;
    },
    enabled: !!user && !!stationId && !!beforeDate && !!pumpIds?.length,
  });
};
