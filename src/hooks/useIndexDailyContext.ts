import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useCountry } from "@/hooks/useCountry";
import { FUEL_PRICES } from "@/config/prices";
import type { Tank } from "@/hooks/useTanks";

const db = supabase as any;

/** Prix unitaires applicables à la date (structure de prix active), sinon prix par défaut. */
export const useDayPrices = (date?: string) => {
  const { user } = useAuth();
  const { scopeQuery, tenantId, countryId } = useScope();
  return useQuery({
    queryKey: ["day-prices", date, tenantId, countryId],
    queryFn: async () => {
      const { data } = await scopeQuery(
        db.from("price_structures").select("super_price,gasoil_price,effective_date,label"),
      )
        .eq("is_active", true)
        .lte("effective_date", date)
        .order("effective_date", { ascending: false })
        .limit(1);
      const p = (data || [])[0];
      if (p && (Number(p.super_price) > 0 || Number(p.gasoil_price) > 0)) {
        return {
          super: Number(p.super_price) || FUEL_PRICES.SUPER,
          gasoil: Number(p.gasoil_price) || FUEL_PRICES.GASOIL,
          source: `Structure de prix du ${new Date(p.effective_date).toLocaleDateString("fr-FR")}`,
        };
      }
      return { super: FUEL_PRICES.SUPER as number, gasoil: FUEL_PRICES.GASOIL as number, source: "Prix par défaut" };
    },
    enabled: !!user && !!date,
  });
};

export interface TankDayContext {
  /** Stock d'ouverture connu (jauge du dernier bilan), null si aucun historique. */
  stockOuverture: number | null;
  ouvertureSource: string | null;
  depotage: number;
  receptions: { reference: string; bl: string | null; driver: string | null; qty: number; variance: number | null }[];
}

/**
 * Pour chaque cuve de la station : stock d'ouverture (jauge précédente) et
 * dépotages du jour importés des réceptions validées (Approvisionnement).
 */
export const useTankDayContext = (stationId?: string, date?: string, tanks: Tank[] = []) => {
  const { user } = useAuth();
  const { scopeQuery, tenantId, countryId } = useScope();
  const { country } = useCountry();
  const tz = country?.timezone || "Africa/Porto-Novo";
  const tankKey = tanks.map((t) => t.id).join(",");
  return useQuery({
    queryKey: ["tank-day-context", stationId, date, tankKey, tenantId, countryId, tz],
    queryFn: async () => {
      const out: Record<string, TankDayContext> = {};
      if (!stationId || !date || !tanks.length) return out;
      for (const t of tanks) out[t.id] = { stockOuverture: null, ouvertureSource: null, depotage: 0, receptions: [] };

      // 1. Dernier bilan cuve connu avant la date
      const { data: prevReadings } = await scopeQuery(
        db.from("index_tank_readings").select("tank_id, jauge, entry_date"),
      )
        .eq("station_id", stationId)
        .lt("entry_date", date)
        .order("entry_date", { ascending: false })
        .limit(200);
      for (const r of prevReadings || []) {
        const c = out[r.tank_id];
        if (c && c.stockOuverture === null) {
          c.stockOuverture = Number(r.jauge) || 0;
          c.ouvertureSource = `Jauge du ${new Date(r.entry_date).toLocaleDateString("fr-FR")}`;
        }
      }

      // 2. Repli : jauges des colonnes historiques de la dernière saisie
      if (Object.values(out).some((c) => c.stockOuverture === null)) {
        const { data: prev } = await scopeQuery(
          db.from("index_entries").select("entry_date, super1_jauge, super2_jauge, gasoil1_jauge, gasoil2_jauge"),
        )
          .eq("station_id", stationId)
          .lt("entry_date", date)
          .order("entry_date", { ascending: false })
          .limit(1);
        const e = (prev || [])[0];
        if (e) {
          const byProduct = (p: "super" | "gasoil") => tanks.filter((t) => t.product_type === p);
          const legacy: Record<"super" | "gasoil", number[]> = {
            super: [Number(e.super1_jauge) || 0, Number(e.super2_jauge) || 0],
            gasoil: [Number(e.gasoil1_jauge) || 0, Number(e.gasoil2_jauge) || 0],
          };
          (["super", "gasoil"] as const).forEach((p) =>
            byProduct(p).forEach((t, i) => {
              const c = out[t.id];
              if (c.stockOuverture === null && i < 2) {
                c.stockOuverture = legacy[p][i];
                c.ouvertureSource = `Jauge du ${new Date(e.entry_date).toLocaleDateString("fr-FR")}`;
              }
            }),
          );
        }
      }

      // 3. Réceptions validées du jour (fuseau du pays)
      const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 36 * 3600_000).toISOString();
      const to = new Date(new Date(`${date}T00:00:00Z`).getTime() + 60 * 3600_000).toISOString();
      const { data: recs } = await scopeQuery(
        db
          .from("supply_requests")
          .select("reference, tank_id, qty_received, received_at, bl_number, driver_name, delivery_variance, status"),
      )
        .eq("station_id", stationId)
        .eq("status", "received")
        .gte("received_at", from)
        .lte("received_at", to);
      for (const r of recs || []) {
        if (!r.tank_id || !out[r.tank_id] || !r.received_at) continue;
        const local = new Date(r.received_at).toLocaleDateString("en-CA", { timeZone: tz });
        if (local !== date) continue;
        const qty = Number(r.qty_received) || 0;
        out[r.tank_id].depotage += qty;
        out[r.tank_id].receptions.push({
          reference: r.reference,
          bl: r.bl_number,
          driver: r.driver_name,
          qty,
          variance: r.delivery_variance == null ? null : Number(r.delivery_variance),
        });
      }
      return out;
    },
    enabled: !!user && !!stationId && !!date && tanks.length > 0,
  });
};

/** Saisie existante (même station, même date) pour reprendre le détail des ventes et les jauges. */
export const useExistingDayEntry = (stationId?: string, date?: string) => {
  const { user } = useAuth();
  const { scopeQuery, tenantId, countryId } = useScope();
  return useQuery({
    queryKey: ["existing-day-entry", stationId, date, tenantId, countryId],
    queryFn: async () => {
      const { data: entries } = await scopeQuery(db.from("index_entries").select("*"))
        .eq("station_id", stationId)
        .eq("entry_date", date)
        .eq("user_id", user!.id)
        .limit(1);
      const entry = (entries || [])[0] || null;
      let readings: any[] = [];
      if (entry) {
        const { data } = await db.from("index_tank_readings").select("*").eq("entry_id", entry.id);
        readings = data || [];
      }
      return { entry, readings };
    },
    enabled: !!user && !!stationId && !!date,
  });
};
