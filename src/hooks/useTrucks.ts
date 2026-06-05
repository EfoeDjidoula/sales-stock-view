import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Truck {
  id: string;
  user_id: string;
  driver_name: string;
  registration: string;
  nominal_capacity: number;
  compartment_count: number;
  compartments: number[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TruckInsert {
  driver_name: string;
  registration: string;
  nominal_capacity: number;
  compartment_count: number;
  compartments: number[];
  notes?: string | null;
}

export const useTrucks = () => {
  const { user } = useAuth();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrucks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("trucks")
        .select("*")
        .order("registration", { ascending: true });
      if (error) throw error;
      setTrucks(
        (data || []).map((t: any) => ({
          ...t,
          compartments: Array.isArray(t.compartments) ? t.compartments : [],
        })) as Truck[]
      );
    } catch (error: any) {
      toast.error("Erreur lors du chargement des camions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createTruck = async (truck: TruckInsert) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("trucks")
        .insert({ ...truck, compartments: truck.compartments as any, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      toast.success("Camion enregistré avec succès");
      await fetchTrucks();
      return data;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      console.error(error);
      return null;
    }
  };

  const updateTruck = async (id: string, truck: TruckInsert) => {
    try {
      const { error } = await supabase
        .from("trucks")
        .update({ ...truck, compartments: truck.compartments as any })
        .eq("id", id);
      if (error) throw error;
      toast.success("Camion modifié avec succès");
      await fetchTrucks();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la modification");
      console.error(error);
      return false;
    }
  };

  const deleteTruck = async (id: string) => {
    try {
      const { error } = await supabase.from("trucks").delete().eq("id", id);
      if (error) throw error;
      toast.success("Camion supprimé");
      await fetchTrucks();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { trucks, loading, createTruck, updateTruck, deleteTruck, refetch: fetchTrucks };
};
