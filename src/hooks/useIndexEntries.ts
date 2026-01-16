import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface IndexEntryData {
  stationId: string;
  entryDate: string;
  super1: { indexDepart: number; indexArrivee: number; jauge: number };
  super2: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil1: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil2: { indexDepart: number; indexArrivee: number; jauge: number };
  versements: {
    momo: { montant: number; reference?: string };
    banque: { montant: number; reference?: string };
    liquidite: { montant: number; note?: string };
  };
  bons: {
    carburant: { nombre: number; valeur: number };
    entreprise: { nombre: number; valeur: number };
  };
}

export interface IndexEntry {
  id: string;
  station_id: string;
  entry_date: string;
  super1_index_depart: number;
  super1_index_arrivee: number;
  super1_jauge: number;
  super2_index_depart: number;
  super2_index_arrivee: number;
  super2_jauge: number;
  gasoil1_index_depart: number;
  gasoil1_index_arrivee: number;
  gasoil1_jauge: number;
  gasoil2_index_depart: number;
  gasoil2_index_arrivee: number;
  gasoil2_jauge: number;
  versement_momo: number;
  versement_momo_ref: string | null;
  versement_banque: number;
  versement_banque_ref: string | null;
  versement_liquidite: number;
  versement_liquidite_note: string | null;
  bons_carburant_nombre: number;
  bons_carburant_valeur: number;
  bons_entreprise_nombre: number;
  bons_entreprise_valeur: number;
  total_super_liters: number;
  total_gasoil_liters: number;
  total_versements: number;
  total_bons: number;
  created_at: string;
  stations?: {
    id: string;
    name: string;
    location: string;
  };
}

export const useIndexEntries = (stationId?: string, startDate?: string, endDate?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["indexEntries", stationId, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("index_entries")
        .select(`
          *,
          stations (
            id,
            name,
            location
          )
        `)
        .order("entry_date", { ascending: false });

      if (stationId) {
        query = query.eq("station_id", stationId);
      }

      if (startDate) {
        query = query.gte("entry_date", startDate);
      }

      if (endDate) {
        query = query.lte("entry_date", endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as IndexEntry[];
    },
    enabled: !!user,
  });
};

export const useStations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
};

export const useSaveIndexEntry = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: IndexEntryData) => {
      if (!user) throw new Error("User not authenticated");

      const entry = {
        user_id: user.id,
        station_id: data.stationId,
        entry_date: data.entryDate,
        super1_index_depart: data.super1.indexDepart,
        super1_index_arrivee: data.super1.indexArrivee,
        super1_jauge: data.super1.jauge,
        super2_index_depart: data.super2.indexDepart,
        super2_index_arrivee: data.super2.indexArrivee,
        super2_jauge: data.super2.jauge,
        gasoil1_index_depart: data.gasoil1.indexDepart,
        gasoil1_index_arrivee: data.gasoil1.indexArrivee,
        gasoil1_jauge: data.gasoil1.jauge,
        gasoil2_index_depart: data.gasoil2.indexDepart,
        gasoil2_index_arrivee: data.gasoil2.indexArrivee,
        gasoil2_jauge: data.gasoil2.jauge,
        versement_momo: data.versements.momo.montant,
        versement_momo_ref: data.versements.momo.reference || null,
        versement_banque: data.versements.banque.montant,
        versement_banque_ref: data.versements.banque.reference || null,
        versement_liquidite: data.versements.liquidite.montant,
        versement_liquidite_note: data.versements.liquidite.note || null,
        bons_carburant_nombre: data.bons.carburant.nombre,
        bons_carburant_valeur: data.bons.carburant.valeur,
        bons_entreprise_nombre: data.bons.entreprise.nombre,
        bons_entreprise_valeur: data.bons.entreprise.valeur,
      };

      const { data: result, error } = await supabase
        .from("index_entries")
        .upsert(entry, {
          onConflict: "user_id,station_id,entry_date",
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
      toast.success("Index enregistrés avec succès");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de l'enregistrement", {
        description: error.message,
      });
    },
  });
};
