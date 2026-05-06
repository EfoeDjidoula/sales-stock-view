import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type ProductType = "super" | "gasoil";
export type PerequationStatus = "pending" | "received";

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Rate {
  id: string;
  zone_id: string;
  product_type: ProductType;
  rate_per_liter: number;
  effective_from: string;
}

export interface PerequationEntry {
  id: string;
  user_id: string;
  station_id: string;
  supply_id: string | null;
  zone_id: string | null;
  product_type: ProductType;
  quantity_liters: number;
  delivery_date: string;
  bl_number: string | null;
  rate_per_liter: number;
  total_amount: number;
  status: PerequationStatus;
  received_date: string | null;
  notes: string | null;
  created_at: string;
}

export const usePerequation = () => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [entries, setEntries] = useState<PerequationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [z, r, e] = await Promise.all([
      supabase.from("perequation_zones").select("*").order("name"),
      supabase.from("perequation_rates").select("*").order("effective_from", { ascending: false }),
      supabase.from("perequation_entries").select("*").order("delivery_date", { ascending: false }),
    ]);
    if (z.error) toast({ variant: "destructive", title: "Erreur", description: z.error.message });
    else setZones((z.data || []) as Zone[]);
    if (r.error) toast({ variant: "destructive", title: "Erreur", description: r.error.message });
    else setRates((r.data || []) as Rate[]);
    if (e.error) toast({ variant: "destructive", title: "Erreur", description: e.error.message });
    else setEntries((e.data || []) as PerequationEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const createZone = async (name: string, description: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("perequation_zones").insert({ name, description, created_by: user.id });
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Zone créée" });
    fetchAll();
  };

  const deleteZone = async (id: string) => {
    const { error } = await supabase.from("perequation_zones").delete().eq("id", id);
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Zone supprimée" });
    fetchAll();
  };

  const createRate = async (zone_id: string, product_type: ProductType, rate_per_liter: number, effective_from: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("perequation_rates").insert({ zone_id, product_type, rate_per_liter, effective_from, created_by: user.id });
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Taux enregistré" });
    fetchAll();
  };

  const deleteRate = async (id: string) => {
    const { error } = await supabase.from("perequation_rates").delete().eq("id", id);
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Taux supprimé" });
    fetchAll();
  };

  const createEntry = async (entry: Omit<PerequationEntry, "id" | "user_id" | "created_at" | "total_amount"> & { total_amount?: number }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const total_amount = entry.total_amount ?? entry.quantity_liters * entry.rate_per_liter;
    const { error } = await supabase.from("perequation_entries").insert({ ...entry, total_amount, user_id: user.id });
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Entrée enregistrée" });
    fetchAll();
  };

  const updateEntryStatus = async (id: string, status: PerequationStatus, received_date: string | null) => {
    const { error } = await supabase.from("perequation_entries").update({ status, received_date }).eq("id", id);
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Statut mis à jour" });
    fetchAll();
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("perequation_entries").delete().eq("id", id);
    if (error) return toast({ variant: "destructive", title: "Erreur", description: error.message });
    toast({ title: "Entrée supprimée" });
    fetchAll();
  };

  return { zones, rates, entries, loading, createZone, deleteZone, createRate, deleteRate, createEntry, updateEntryStatus, deleteEntry, refresh: fetchAll };
};
