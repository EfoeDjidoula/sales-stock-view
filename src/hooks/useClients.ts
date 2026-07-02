import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientInsert {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const useClients = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setClients((data || []) as Client[]);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des clients");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createClient = async (client: ClientInsert) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...client, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      toast.success("Client enregistré avec succès");
      await fetchClients();
      return data;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      console.error(error);
      return null;
    }
  };

  const updateClient = async (id: string, client: ClientInsert) => {
    try {
      const { error } = await supabase.from("clients").update(client).eq("id", id);
      if (error) throw error;
      toast.success("Client modifié avec succès");
      await fetchClients();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la modification");
      console.error(error);
      return false;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      toast.success("Client supprimé");
      await fetchClients();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { clients, loading, createClient, updateClient, deleteClient, refetch: fetchClients };
};
