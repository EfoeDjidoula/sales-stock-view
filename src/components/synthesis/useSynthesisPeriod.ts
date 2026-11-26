import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useCountry } from "@/hooks/useCountry";
import { addDays } from "@/lib/reports";
import { localDay } from "@/lib/accountClosing";
import { fallbackFuelPrices } from "@/config/prices";
import { priceResolver, type InvReading, type InvReception, type InvTank, type PriceStructure, type PumpEntryRow, type SalesEntry } from "@/lib/ecap";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function fetchAll<T>(build: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const all: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

export interface StationRef { id: string; name: string }
export interface PeriodData {
  entries: (SalesEntry & { id: string; station_id: string; status: string; banque_nom?: string | null })[];
  pumps: (PumpEntryRow & { station_id: string })[];
  readings: (InvReading & { station_id: string })[];
  tanks: (InvTank & { station_id: string })[];
  /** Réceptions logistiques validées (jour local du pays), comptées au volume BL. */
  receptions: (InvReception & { station_id: string })[];
  pumpNames: Map<string, string>;
  price: ReturnType<typeof priceResolver>;
}

/** Stations du périmètre actif (société + pays). */
export function useScopedStations() {
  const { tenantId, countryId, scopeQuery } = useScope();
  return useQuery({
    queryKey: ["synthesis-stations", tenantId, countryId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await scopeQuery(db.from("stations").select("id,name")).order("name");
      if (error) throw error;
      return (data ?? []) as StationRef[];
    },
  });
}

/**
 * Saisies d'index retenues (validées N+1, en attente en option) de toutes les stations du périmètre,
 * avec index par pistolet, bilans de cuve et prix du jour. Lecture seule, filtrée par la RLS.
 */
export function useSynthesisPeriod(from: string, to: string, includePending: boolean) {
  const { tenantId, countryId, scopeQuery } = useScope();
  const { country } = useCountry();
  const tz = country?.timezone || "Africa/Porto-Novo";
  return useQuery({
    queryKey: ["synthesis-period", tenantId, countryId, from, to, includePending, tz, country?.iso_code],
    enabled: !!tenantId && !!from && !!to && from <= to,
    queryFn: async (): Promise<PeriodData> => {
      const statuses = includePending ? ["valide", "pre_enregistre"] : ["valide"];
      const entries = await fetchAll<PeriodData["entries"][number]>((a, b) =>
        scopeQuery(db.from("index_entries").select("id,station_id,status,entry_date,vente_globale,autoconso_montant,bons_clients_montant,tickets_valeur_montant,cartes_montant,versement_momo,versement_banque,banque_nom"))
          .gte("entry_date", from).lte("entry_date", to).in("status", statuses).order("entry_date").range(a, b));
      const ids = new Set(entries.map((e) => e.id));
      const [pumps, readings, tanks, names, structures, recRaw] = await Promise.all([
        fetchAll<PeriodData["pumps"][number] & { entry_id: string }>((a, b) =>
          scopeQuery(db.from("pump_index_entries").select("entry_id,station_id,entry_date,pump_id,product_type,index_depart,index_arrivee,retour_cuve"))
            .gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<PeriodData["readings"][number] & { entry_id: string }>((a, b) =>
          scopeQuery(db.from("index_tank_readings").select("entry_id,station_id,entry_date,tank_id,stock_ouverture,depotage,sortie,jauge"))
            .gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<PeriodData["tanks"][number]>((a, b) => scopeQuery(db.from("tanks").select("id,name,product_type,station_id")).order("name").range(a, b)),
        fetchAll<{ id: string; name: string }>((a, b) => scopeQuery(db.from("pumps").select("id,name")).order("id").range(a, b)),
        scopeQuery(db.from("price_structures").select("effective_date,super_price,gasoil_price")).eq("is_active", true).lte("effective_date", to).order("effective_date")
          .then((r: { data: PriceStructure[] | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data ?? []; }),
        fetchAll<{ station_id: string; tank_id: string | null; qty_loaded: number | null; qty_received: number | null; received_at: string }>((a, b) =>
          scopeQuery(db.from("supply_requests").select("station_id,tank_id,qty_loaded,qty_received,received_at"))
            .eq("status", "received").gte("received_at", addDays(from, -1)).lt("received_at", addDays(to, 2)).order("received_at").range(a, b)),
      ]);
      const receptions = recRaw
        .map((r) => ({ station_id: r.station_id, tank_id: r.tank_id, qty_loaded: r.qty_loaded, qty_received: r.qty_received, date: localDay(r.received_at, tz) }))
        .filter((r) => r.date >= from && r.date <= to);
      return {
        entries,
        pumps: pumps.filter((p) => ids.has(p.entry_id)),
        readings: readings.filter((r) => ids.has(r.entry_id)),
        tanks,
        receptions,
        pumpNames: new Map(names.map((p) => [p.id, p.name])),
        price: priceResolver(structures, fallbackFuelPrices(country?.iso_code)),
      };
    },
  });
}

/** Sous-ensemble des données d'une station. */
export function forStation(d: PeriodData, stationId: string) {
  return {
    entries: d.entries.filter((e) => e.station_id === stationId),
    pumps: d.pumps.filter((p) => p.station_id === stationId),
    readings: d.readings.filter((r) => r.station_id === stationId),
    tanks: d.tanks.filter((t) => t.station_id === stationId),
    receptions: d.receptions.filter((r) => r.station_id === stationId),
  };
}
