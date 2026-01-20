import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Order {
  id: string;
  user_id: string;
  station_id: string;
  proforma_number: string;
  supplier: string;
  unit_price: number;
  total_quantity: number;
  amount_ht: number;
  amount_ttc: number;
  status: string;
  created_at: string;
  updated_at: string;
  station?: {
    name: string;
    location: string;
  };
}

export interface OrderInsert {
  station_id: string;
  proforma_number: string;
  supplier: string;
  unit_price: number;
  total_quantity: number;
  amount_ht: number;
  amount_ttc: number;
}

export const useOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          station:stations(name, location)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des commandes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (order: OrderInsert) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          ...order,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Commande créée avec succès");
      await fetchOrders();
      return data;
    } catch (error: any) {
      toast.error("Erreur lors de la création de la commande");
      console.error(error);
      return null;
    }
  };

  const updateOrder = async (id: string, updates: Partial<OrderInsert>) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      toast.success("Commande mise à jour");
      await fetchOrders();
    } catch (error: any) {
      toast.error("Erreur lors de la mise à jour");
      console.error(error);
    }
  };

  const deleteOrder = async (id: string) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", id);

      if (error) throw error;
      toast.success("Commande supprimée");
      await fetchOrders();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user]);

  return {
    orders,
    loading,
    createOrder,
    updateOrder,
    deleteOrder,
    refetch: fetchOrders,
  };
};
