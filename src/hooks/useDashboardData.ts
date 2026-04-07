import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";
import { FUEL_PRICES } from "@/config/prices";

export interface DashboardStation {
  id: string;
  name: string;
  location: string;
}

export interface DailySalesData {
  date: string;
  superLiters: number;
  gasoilLiters: number;
  superAmount: number;
  gasoilAmount: number;
  totalAmount: number;
  stationId: string;
  stationName: string;
  // Stock (jauges)
  super1Jauge: number;
  super2Jauge: number;
  gasoil1Jauge: number;
  gasoil2Jauge: number;
}

export type Period = "day" | "week" | "month";

const getPeriodRange = (period: Period) => {
  const today = new Date();
  switch (period) {
    case "day":
      return { start: format(startOfDay(today), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") };
    case "week":
      return { start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") };
    case "month":
      return { start: format(startOfMonth(today), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") };
  }
};

export const useDashboardData = (period: Period, stationId?: string | null) => {
  const { user } = useAuth();
  const range = getPeriodRange(period);

  const stationsQuery = useQuery({
    queryKey: ["db-stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, name, location")
        .order("name");
      if (error) throw error;
      return data as DashboardStation[];
    },
    enabled: !!user,
  });

  const entriesQuery = useQuery({
    queryKey: ["dashboard-entries", range.start, range.end, stationId],
    queryFn: async () => {
      let query = supabase
        .from("index_entries")
        .select("*, stations(id, name, location)")
        .gte("entry_date", range.start)
        .lte("entry_date", range.end)
        .order("entry_date", { ascending: true });

      if (stationId) {
        query = query.eq("station_id", stationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch latest jauge (stock) per station from the most recent complete entry
  const latestJaugeQuery = useQuery({
    queryKey: ["latest-jauge", stationId],
    queryFn: async () => {
      // Get the latest entry per station where at least one index_arrivee > 0
      let query = supabase
        .from("index_entries")
        .select("station_id, super1_jauge, super2_jauge, gasoil1_jauge, gasoil2_jauge, entry_date, super1_index_arrivee, gasoil1_index_arrivee")
        .or("super1_index_arrivee.gt.0,super2_index_arrivee.gt.0,gasoil1_index_arrivee.gt.0,gasoil2_index_arrivee.gt.0")
        .order("entry_date", { ascending: false })
        .limit(50);

      if (stationId) {
        query = query.eq("station_id", stationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Keep only the latest entry per station
      const latestByStation = new Map<string, { superJauge: number; gasoilJauge: number; date: string }>();
      for (const entry of data || []) {
        if (!latestByStation.has(entry.station_id)) {
          latestByStation.set(entry.station_id, {
            superJauge: entry.super1_jauge + entry.super2_jauge,
            gasoilJauge: entry.gasoil1_jauge + entry.gasoil2_jauge,
            date: entry.entry_date,
          });
        }
      }
      return latestByStation;
    },
    enabled: !!user,
  });

  // Also fetch recent 30 days for chart regardless of period filter
  const chartQuery = useQuery({
    queryKey: ["dashboard-chart", stationId],
    queryFn: async () => {
      const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
      let query = supabase
        .from("index_entries")
        .select("entry_date, station_id, super1_index_depart, super1_index_arrivee, super2_index_depart, super2_index_arrivee, gasoil1_index_depart, gasoil1_index_arrivee, gasoil2_index_depart, gasoil2_index_arrivee, stations(name)")
        .gte("entry_date", thirtyDaysAgo)
        .order("entry_date", { ascending: true });

      if (stationId) {
        query = query.eq("station_id", stationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const entries = entriesQuery.data || [];
  const latestJauges = latestJaugeQuery.data || new Map();

  const computeSales = (entry: typeof entries[number]): DailySalesData => {
    const s1 = entry.super1_index_arrivee - entry.super1_index_depart;
    const s2 = entry.super2_index_arrivee - entry.super2_index_depart;
    const g1 = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
    const g2 = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
    // Ignore negative diffs (incomplete/empty entries)
    const superLiters = (s1 > 0 ? s1 : 0) + (s2 > 0 ? s2 : 0);
    const gasoilLiters = (g1 > 0 ? g1 : 0) + (g2 > 0 ? g2 : 0);

    const stationData = entry.stations as unknown as DashboardStation;

    return {
      date: entry.entry_date,
      superLiters,
      gasoilLiters,
      superAmount: superLiters * FUEL_PRICES.SUPER,
      gasoilAmount: gasoilLiters * FUEL_PRICES.GASOIL,
      totalAmount: superLiters * FUEL_PRICES.SUPER + gasoilLiters * FUEL_PRICES.GASOIL,
      stationId: entry.station_id,
      stationName: stationData?.name || "",
      super1Jauge: entry.super1_jauge,
      super2Jauge: entry.super2_jauge,
      gasoil1Jauge: entry.gasoil1_jauge,
      gasoil2Jauge: entry.gasoil2_jauge,
    };
  };

  const salesData = entries.map(computeSales);

  const totalSales = salesData.reduce((sum, d) => sum + d.totalAmount, 0);
  const totalSuper = salesData.reduce((sum, d) => sum + d.superAmount, 0);
  const totalGasoil = salesData.reduce((sum, d) => sum + d.gasoilAmount, 0);

  // Sales by station
  const salesByStation = new Map<string, { total: number; super: number; gasoil: number; name: string; location: string; superJauge: number; gasoilJauge: number }>();
  
  // First, initialize with latest jauge data for all stations
  for (const station of (stationsQuery.data || [])) {
    const latestJauge = latestJauges.get(station.id);
    salesByStation.set(station.id, {
      total: 0, super: 0, gasoil: 0,
      name: station.name, location: station.location,
      superJauge: latestJauge?.superJauge || 0,
      gasoilJauge: latestJauge?.gasoilJauge || 0,
    });
  }
  
  // Then accumulate sales from the period
  for (const d of salesData) {
    const existing = salesByStation.get(d.stationId) || { total: 0, super: 0, gasoil: 0, name: d.stationName, location: "", superJauge: 0, gasoilJauge: 0 };
    existing.total += d.totalAmount;
    existing.super += d.superAmount;
    existing.gasoil += d.gasoilAmount;
    // Don't override jauge - we use latest known values from latestJaugeQuery
    salesByStation.set(d.stationId, existing);
  }

  // Chart data aggregated by date
  const chartData = (() => {
    const chartEntries = chartQuery.data || [];
    const dateMap = new Map<string, { super: number; gasoil: number }>();

    for (const entry of chartEntries) {
      const s1 = entry.super1_index_arrivee - entry.super1_index_depart;
      const s2 = entry.super2_index_arrivee - entry.super2_index_depart;
      const g1 = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
      const g2 = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
      const superL = (s1 > 0 ? s1 : 0) + (s2 > 0 ? s2 : 0);
      const gasoilL = (g1 > 0 ? g1 : 0) + (g2 > 0 ? g2 : 0);

      const existing = dateMap.get(entry.entry_date) || { super: 0, gasoil: 0 };
      existing.super += superL * FUEL_PRICES.SUPER;
      existing.gasoil += gasoilL * FUEL_PRICES.GASOIL;
      dateMap.set(entry.entry_date, existing);
    }

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        super: values.super,
        gasoil: values.gasoil,
        total: values.super + values.gasoil,
      }));
  })();

  return {
    stations: stationsQuery.data || [],
    totalSales,
    totalSuper,
    totalGasoil,
    salesByStation,
    chartData,
    salesData,
    isLoading: stationsQuery.isLoading || entriesQuery.isLoading || chartQuery.isLoading || latestJaugeQuery.isLoading,
  };
};
