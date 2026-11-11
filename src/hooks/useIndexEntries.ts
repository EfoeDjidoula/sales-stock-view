import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useScope } from "@/hooks/useScope";

export interface PumpEntryInput {
  pumpId: string;
  tankId: string | null;
  productType: "super" | "gasoil";
  indexDepart: number;
  indexArrivee: number;
  /** Retour en cuve (L) sur ce pistolet. */
  retour?: number;
}

export interface TankReadingInput {
  tankId: string;
  productType: "super" | "gasoil";
  /** Utilisé seulement sans historique : le serveur reprend sinon la jauge de la veille. */
  stockOuverture: number;
  jauge: number;
}

export interface SalesDetailInput {
  venteGlobale: number;
  autoconso: number;
  bonsClients: number;
  ticketsValeur: number;
  cartes: number;
  banqueNom?: string;
}

export interface IndexEntryData {
  stationId: string;
  entryDate: string;
  super1: { indexDepart: number; indexArrivee: number; jauge: number };
  super2: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil1: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil2: { indexDepart: number; indexArrivee: number; jauge: number };
  /** Optional dynamic pump-level rows (when station has pumps configured). */
  pumpEntries?: PumpEntryInput[];
  /** Bilan cuve journalier (stock ouverture, jauge) — dépotages et sorties recalculés côté serveur. */
  tankReadings?: TankReadingInput[];
  /** Détail des ventes (modèle unifié). */
  sales?: SalesDetailInput;
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
  autoconso_montant?: number;
  bons_clients_montant?: number;
  tickets_valeur_montant?: number;
  cartes_montant?: number;
  vente_globale?: number | null;
  montant_a_verser?: number | null;
  ecart_versement?: number | null;
  banque_nom?: string | null;
  created_at: string;
  stations?: {
    id: string;
    name: string;
    location: string;
  };
}

export const useIndexEntries = (stationId?: string, startDate?: string, endDate?: string) => {
  const { user } = useAuth();
  const { scopeQuery, tenantId, countryId } = useScope();

  return useQuery({
    queryKey: ["indexEntries", stationId, startDate, endDate, tenantId, countryId],
    queryFn: async () => {
      let query = scopeQuery(
        supabase
          .from("index_entries")
          .select(`
          *,
          stations (
            id,
            name,
            location
          )
        `)
      ).order("entry_date", { ascending: false });

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
  const { scopeQuery, tenantId, countryId } = useScope();

  return useQuery({
    queryKey: ["stations", tenantId, countryId],
    queryFn: async () => {
      const { data, error } = await scopeQuery(
        supabase.from("stations").select("*")
      ).order("name");

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
};

export const useSaveIndexEntry = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { scopeRow } = useScope();

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
        ...(data.sales
          ? {
              vente_globale: data.sales.venteGlobale,
              autoconso_montant: data.sales.autoconso,
              bons_clients_montant: data.sales.bonsClients,
              tickets_valeur_montant: data.sales.ticketsValeur,
              cartes_montant: data.sales.cartes,
              banque_nom: data.sales.banqueNom || null,
            }
          : {}),
      };

      const { data: result, error } = await supabase
        .from("index_entries")
        .upsert(scopeRow(entry) as any, {
          onConflict: "user_id,station_id,entry_date",
        })
        .select()
        .single();

      if (error) throw error;

      // Persist pump-level rows if provided
      if (data.pumpEntries && data.pumpEntries.length > 0) {
        // Wipe out previous pump rows for this entry to avoid stale lines (pump removed/relinked)
        const { error: delErr } = await supabase
          .from("pump_index_entries")
          .delete()
          .eq("entry_id", result.id);
        if (delErr) throw delErr;

        const rows = data.pumpEntries.map((p) => scopeRow({
          entry_id: result.id,
          pump_id: p.pumpId,
          tank_id: p.tankId,
          station_id: data.stationId,
          user_id: user.id,
          entry_date: data.entryDate,
          product_type: p.productType,
          index_depart: p.indexDepart,
          index_arrivee: p.indexArrivee,
          retour_cuve: p.retour || 0,
        }) as any);
        const { error: insErr } = await supabase.from("pump_index_entries").insert(rows);
        if (insErr) throw insErr;
      }

      // Bilan cuve : le serveur recalcule ouverture (veille), dépotages validés et sorties pistolets
      if (data.tankReadings && data.tankReadings.length > 0) {
        const db = supabase as any;
        const { error: delT } = await db.from("index_tank_readings").delete().eq("entry_id", result.id);
        if (delT) throw delT;
        const { error: insT } = await db.from("index_tank_readings").insert(
          data.tankReadings.map((t) => scopeRow({
            entry_id: result.id,
            tank_id: t.tankId,
            station_id: data.stationId,
            user_id: user.id,
            entry_date: data.entryDate,
            product_type: t.productType,
            stock_ouverture: t.stockOuverture,
            jauge: t.jauge,
          })),
        );
        if (insT) throw insT;
      }

      // Relire la saisie avec les montants recalculés côté serveur
      const { data: fresh } = await supabase.from("index_entries").select("*").eq("id", result.id).maybeSingle();
      const { data: readings } = await (supabase as any)
        .from("index_tank_readings").select("*").eq("entry_id", result.id);
      return { entry: (fresh || result) as any, readings: (readings || []) as any[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
      queryClient.invalidateQueries({ queryKey: ["latest-jauge"] });
      queryClient.invalidateQueries({ queryKey: ["stock-jauges"] });
      queryClient.invalidateQueries({ queryKey: ["pump-index-entries"] });
      queryClient.invalidateQueries({ queryKey: ["previous-pump-index"] });
      queryClient.invalidateQueries({ queryKey: ["tank-day-context"] });
      queryClient.invalidateQueries({ queryKey: ["existing-day-entry"] });
      toast.success("Index enregistrés avec succès");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de l'enregistrement", {
        description: error.message,
      });
    },
  });
};
