import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  product_type: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierInsert {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  product_type?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const useSuppliers = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setSuppliers((data || []) as Supplier[]);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des fournisseurs");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createSupplier = async (supplier: SupplierInsert) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ ...supplier, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      toast.success("Fournisseur enregistré avec succès");
      await fetchSuppliers();
      return data;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      console.error(error);
      return null;
    }
  };

  const updateSupplier = async (id: string, supplier: SupplierInsert) => {
    try {
      const { error } = await supabase.from("suppliers").update(supplier).eq("id", id);
      if (error) throw error;
      toast.success("Fournisseur modifié avec succès");
      await fetchSuppliers();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la modification");
      console.error(error);
      return false;
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      toast.success("Fournisseur supprimé");
      await fetchSuppliers();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { suppliers, loading, createSupplier, updateSupplier, deleteSupplier, refetch: fetchSuppliers };
};
