import { formatNumber } from "@/data/stationsData";
import { StockGauge } from "./StockGauge";
import { Fuel, Droplet, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

interface StockModuleProps {
  stationId?: string | null;
}

export const StockModule = ({ stationId }: StockModuleProps) => {
  const { user } = useAuth();

  // Fetch latest entry per station for jauge data
  const { data: latestEntries, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["stock-jauges", stationId],
    queryFn: async () => {
      // Get stations first
      const { data: stations } = await supabase
        .from("stations")
        .select("id, name, location")
        .order("name");

      if (!stations) return [];

      const targetStations = stationId
        ? stations.filter((s) => s.id === stationId)
        : stations;

      // Load configured tanks (capacity per station) once
      let tanksQuery = supabase
        .from("tanks")
        .select("id, station_id, name, product_type, capacity_liters")
        .order("product_type")
        .order("name");
      if (stationId) tanksQuery = tanksQuery.eq("station_id", stationId);
      const { data: tanksData } = await tanksQuery;
      const allTanks = (tanksData || []) as Array<{
        id: string;
        station_id: string;
        name: string;
        product_type: "super" | "gasoil";
        capacity_liters: number;
      }>;

      const DEFAULT_CAPACITY = 15000;
      const results = [];

      for (const station of targetStations) {
        // Get latest entry with non-zero jauge data
        const { data: entry } = await supabase
          .from("index_entries")
          .select("*")
          .eq("station_id", station.id)
          .or("super1_jauge.gt.0,super2_jauge.gt.0,gasoil1_jauge.gt.0,gasoil2_jauge.gt.0")
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!entry) continue;

        const stationTanks = allTanks.filter((t) => t.station_id === station.id);
        const jaugesByProduct: Record<"super" | "gasoil", number[]> = {
          super: [entry.super1_jauge, entry.super2_jauge],
          gasoil: [entry.gasoil1_jauge, entry.gasoil2_jauge],
        };

        let stocks: Array<{ tank: string; jauge: number; product: "super" | "gasoil"; capacity: number }>;

        if (stationTanks.length > 0) {
          // Driven by the station's configured tanks: name + real capacity.
          // Legacy jauge columns are mapped per product type, in tank order.
          const cursor: Record<"super" | "gasoil", number> = { super: 0, gasoil: 0 };
          stocks = stationTanks.map((t) => {
            const idx = cursor[t.product_type]++;
            const jauge = jaugesByProduct[t.product_type][idx] ?? 0;
            return {
              tank: t.name,
              jauge,
              product: t.product_type,
              capacity: Number(t.capacity_liters) || DEFAULT_CAPACITY,
            };
          });
        } else {
          // Fallback: stations without configured tanks keep the legacy layout.
          stocks = [
            { tank: "SUPER 1", jauge: entry.super1_jauge, product: "super" as const, capacity: DEFAULT_CAPACITY },
            { tank: "SUPER 2", jauge: entry.super2_jauge, product: "super" as const, capacity: DEFAULT_CAPACITY },
            { tank: "GASOIL 1", jauge: entry.gasoil1_jauge, product: "gasoil" as const, capacity: DEFAULT_CAPACITY },
            { tank: "GASOIL 2", jauge: entry.gasoil2_jauge, product: "gasoil" as const, capacity: DEFAULT_CAPACITY },
          ];
        }

        results.push({
          stationId: station.id,
          stationName: station.name,
          stocks: stocks.filter((s) => s.jauge > 0),
        });
      }

      return results;
    },
    enabled: !!user,
  });

  const isPending = isLoading || isFetching;
  const entries = latestEntries || [];

  const totalSuper = entries.reduce(
    (sum, e) => sum + e.stocks.filter((s) => s.product === "super").reduce((s, st) => s + st.jauge, 0),
    0
  );
  const totalGasoil = entries.reduce(
    (sum, e) => sum + e.stocks.filter((s) => s.product === "gasoil").reduce((s, st) => s + st.jauge, 0),
    0
  );

  const lowStockAlerts = entries.flatMap((e) =>
    e.stocks
      .filter((s) => s.jauge > 0 && s.jauge < 500)
      .map((s) => ({ station: e.stationName, tank: s.tank, jauge: s.jauge }))
  );

  if (isError && !isPending) {
    return (
      <div
        role="alert"
        data-testid="stock-error"
        className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-2 text-destructive"
      >
        <AlertTriangle className="w-5 h-5" />
        <span className="font-medium">
          Erreur lors du chargement des stocks
          {error instanceof Error ? ` : ${error.message}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isPending ? (
          <div data-testid="stock-summary-skeleton" className="contents">
            <Skeleton data-testid="stock-summary-skeleton-super" className="h-36 w-full rounded-xl" />
            <Skeleton data-testid="stock-summary-skeleton-gasoil" className="h-36 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <div data-testid="stock-summary-super" className="bg-card rounded-xl border border-super/30 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-lg bg-super/10">
                  <Fuel className="w-5 h-5 text-super" />
                </div>
                <div>
                  <h4 className="font-display font-semibold">Stock Super (Jauges)</h4>
                  <p className="text-sm text-muted-foreground">Dernière saisie</p>
                </div>
              </div>
              <div className="text-2xl font-display font-bold">
                {formatNumber(totalSuper)} L
              </div>
            </div>

            <div data-testid="stock-summary-gasoil" className="bg-card rounded-xl border border-gasoil/30 p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-lg bg-gasoil/10">
                  <Droplet className="w-5 h-5 text-gasoil" />
                </div>
                <div>
                  <h4 className="font-display font-semibold">Stock Gasoil (Jauges)</h4>
                  <p className="text-sm text-muted-foreground">Dernière saisie</p>
                </div>
              </div>
              <div className="text-2xl font-display font-bold">
                {formatNumber(totalGasoil)} L
              </div>
            </div>
          </>
        )}
      </div>

      {/* Low stock alerts */}
      {isPending ? (
        <Skeleton data-testid="stock-alerts-skeleton" className="h-24 w-full rounded-xl" />
      ) : lowStockAlerts.length > 0 ? (
        <div data-testid="stock-alerts" className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h4 className="font-display font-semibold text-destructive">
              Alertes Stock Bas ({lowStockAlerts.length})
            </h4>
          </div>
          <div className="space-y-2">
            {lowStockAlerts.map((alert, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-sm bg-card/50 rounded-lg px-3 py-2"
              >
                <span>
                  <span className="font-medium">{alert.station}</span>
                  <span className="text-muted-foreground"> - {alert.tank}</span>
                </span>
                <span className="font-bold text-destructive">{formatNumber(alert.jauge)} L</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Detailed stock by station */}
      {isPending ? (
        <div data-testid="stock-list-skeleton" className="space-y-4">
          <Skeleton data-testid="stock-list-skeleton-header" className="h-6 w-64" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton data-testid="stock-list-skeleton-gauge" className="h-32 w-full rounded-xl" />
              <Skeleton data-testid="stock-list-skeleton-gauge" className="h-32 w-full rounded-xl" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton data-testid="stock-list-skeleton-gauge" className="h-32 w-full rounded-xl" />
              <Skeleton data-testid="stock-list-skeleton-gauge" className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div data-testid="stock-empty" className="flex items-center justify-center py-12 text-muted-foreground">
          Aucune donnée de stock disponible. Importez un fichier Excel pour voir les jauges.
        </div>
      ) : (
        <div data-testid="stock-list" className="space-y-4">
          <h3 className="text-lg font-display font-semibold">
            Détail des jauges par station
          </h3>
          {entries.map((entry) => (
            <div key={entry.stationId} data-testid="stock-list-station" className="space-y-3">
              {!stationId && (
                <h4 className="text-sm font-medium text-primary uppercase tracking-wider">
                  {entry.stationName}
                </h4>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entry.stocks.map((stock, index) => (
                  <StockGauge
                    key={`${entry.stationId}-${index}`}
                    tank={stock.tank}
                    capacity={15000}
                    currentStock={stock.jauge}
                    product={stock.product}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
