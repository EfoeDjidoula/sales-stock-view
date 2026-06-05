import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type ProductType = "super" | "gasoil";

export interface Depotage {
  id: string;
  user_id: string;
  station_id: string;
  tank_id: string | null;
  truck_id: string | null;
  product_type: ProductType;
  truck_registration: string;
  truck_nominal_capacity: number;
  tank_capacity_liters: number;
  quantity_to_unload: number;
  quantity_unloaded: number;
  tolerance_rate: number;
  ecart: number;
  stock_before: number;
  gauge_after: number;
  stock_theoretical: number;
  depotage_ecart: number;
  start_time: string | null;
  end_time: string | null;
  depotage_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  station?: { name: string; location: string } | null;
  tank?: { name: string; capacity_liters: number } | null;
}

export interface DepotageInsert {
  station_id: string;
  tank_id: string | null;
  truck_id: string | null;
  product_type: ProductType;
  truck_registration: string;
  truck_nominal_capacity: number;
  tank_capacity_liters: number;
  quantity_to_unload: number;
  quantity_unloaded: number;
  tolerance_rate: number;
  stock_before: number;
  gauge_after: number;
  start_time: string | null;
  end_time: string | null;
  depotage_date: string;
  notes?: string;
}

export const useDepotages = () => {
  const { user } = useAuth();
  const [depotages, setDepotages] = useState<Depotage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDepotages = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("depotages")
        .select(
          `*, station:stations(name, location), tank:tanks(name, capacity_liters)`
        )
        .order("depotage_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDepotages((data || []) as Depotage[]);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des dépotages");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createDepotage = async (depotage: DepotageInsert) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("depotages")
        .insert({ ...depotage, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      toast.success("Dépotage enregistré avec succès");
      await fetchDepotages();
      return data;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      console.error(error);
      return null;
    }
  };

  const deleteDepotage = async (id: string) => {
    try {
      const { error } = await supabase.from("depotages").delete().eq("id", id);
      if (error) throw error;
      toast.success("Dépotage supprimé");
      await fetchDepotages();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchDepotages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    depotages,
    loading,
    createDepotage,
    deleteDepotage,
    refetch: fetchDepotages,
  };
};
