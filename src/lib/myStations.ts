import { supabase } from "@/integrations/supabase/client";

/** Stations affectées à l'utilisateur ; null = aucune affectation → vue réseau complète. */
export const fetchMyStationIds = async (userId: string): Promise<Set<string> | null> => {
  const { data, error } = await supabase.from("station_assignments").select("station_id").eq("user_id", userId);
  if (error) throw error;
  return data && data.length ? new Set(data.map((r) => r.station_id as string)) : null;
};

export const restrictToMine = <T extends { id: string }>(rows: T[], mine: Set<string> | null) =>
  mine ? rows.filter((r) => mine.has(r.id)) : rows;
