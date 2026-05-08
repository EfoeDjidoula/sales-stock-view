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
  const { data: latestEntries, isLoading, isFetching } = useQuery({
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

        if (entry) {
          results.push({
            stationId: station.id,
            stationName: station.name,
            stocks: [
              { tank: "SUPER 1", jauge: entry.super1_jauge, product: "super" as const },
              { tank: "SUPER 2", jauge: entry.super2_jauge, product: "super" as const },
              { tank: "GASOIL 1", jauge: entry.gasoil1_jauge, product: "gasoil" as const },
              { tank: "GASOIL 2", jauge: entry.gasoil2_jauge, product: "gasoil" as const },
            ].filter((s) => s.jauge > 0),
          });
        }
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

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isPending ? (
          <>
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
          </>
        ) : (
          <>
            <div className="bg-card rounded-xl border border-super/30 p-5">
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

            <div className="bg-card rounded-xl border border-gasoil/30 p-5">
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
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : lowStockAlerts.length > 0 ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
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
        <div className="space-y-4">
          <Skeleton className="h-6 w-64" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Aucune donnée de stock disponible. Importez un fichier Excel pour voir les jauges.
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-display font-semibold">
            Détail des jauges par station
          </h3>
          {entries.map((entry) => (
            <div key={entry.stationId} className="space-y-3">
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
