import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Supply {
  id: string;
  user_id: string;
  order_id: string;
  station_id: string;
  quantity_received: number;
  reception_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  order?: {
    proforma_number: string;
    supplier: string;
    unit_price: number;
    total_quantity: number;
    amount_ht: number;
    amount_ttc: number;
  };
  station?: {
    name: string;
    location: string;
  };
}

export interface SupplyInsert {
  order_id: string;
  station_id: string;
  quantity_received: number;
  reception_date: string;
  notes?: string;
}

export const useSupplies = () => {
  const { user } = useAuth();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSupplies = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("supplies")
        .select(`
          *,
          order:orders(proforma_number, supplier, unit_price, total_quantity, amount_ht, amount_ttc),
          station:stations(name, location)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSupplies(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des approvisionnements");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createSupply = async (supply: SupplyInsert) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from("supplies")
        .insert({
          ...supply,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Approvisionnement enregistré avec succès");
      await fetchSupplies();
      return data;
    } catch (error: any) {
      toast.error("Erreur lors de l'enregistrement");
      console.error(error);
      return null;
    }
  };

  const updateSupply = async (id: string, updates: Partial<SupplyInsert>) => {
    try {
      const { error } = await supabase
        .from("supplies")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      toast.success("Approvisionnement mis à jour");
      await fetchSupplies();
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour");
      console.error(error);
    }
  };

  const deleteSupply = async (id: string) => {
    try {
      const { error } = await supabase.from("supplies").delete().eq("id", id);

      if (error) throw error;
      toast.success("Approvisionnement supprimé");
      await fetchSupplies();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchSupplies();
  }, [user]);

  return {
    supplies,
    loading,
    createSupply,
    updateSupply,
    deleteSupply,
    refetch: fetchSupplies,
  };
};
