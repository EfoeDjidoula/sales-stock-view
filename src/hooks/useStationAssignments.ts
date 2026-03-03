import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StationAssignment {
  id: string;
  user_id: string;
  station_id: string;
  created_at: string;
}

export const useStationAssignments = () => {
  const [assignments, setAssignments] = useState<StationAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("station_assignments")
        .select("*");
      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  };

  const assignUser = async (userId: string, stationId: string) => {
    try {
      const { error } = await supabase
        .from("station_assignments")
        .insert({ user_id: userId, station_id: stationId });
      if (error) {
        if (error.code === "23505") {
          toast.error("Cet opérateur est déjà assigné à cette station.");
          return;
        }
        throw error;
      }
      toast.success("Opérateur assigné avec succès");
      await fetchAssignments();
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'assignation");
    }
  };

  const unassignUser = async (userId: string, stationId: string) => {
    try {
      const { error } = await supabase
        .from("station_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("station_id", stationId);
      if (error) throw error;
      toast.success("Assignation retirée");
      await fetchAssignments();
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors du retrait de l'assignation");
    }
  };

  const getAssignedUsers = (stationId: string) =>
    assignments.filter((a) => a.station_id === stationId);

  const getAssignedStations = (userId: string) =>
    assignments.filter((a) => a.user_id === userId);

  useEffect(() => {
    fetchAssignments();
  }, []);

  return {
    assignments,
    loading,
    assignUser,
    unassignUser,
    getAssignedUsers,
    getAssignedStations,
    refetch: fetchAssignments,
  };
};
