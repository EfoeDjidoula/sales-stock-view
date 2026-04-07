import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/data/stationsData";
import { Button } from "@/components/ui/button";

interface StationTrendEntry {
  date: string;
  stationId: string;
  stationName: string;
  total: number;
}

interface SalesTrendByStationProps {
  rawChartEntries: any[];
  stations: { id: string; name: string }[];
}

const STATION_COLORS = [
  "hsl(38 92% 50%)",   // amber
  "hsl(217 91% 60%)",  // blue
  "hsl(142 71% 45%)",  // green
  "hsl(0 84% 60%)",    // red
  "hsl(280 67% 55%)",  // purple
  "hsl(190 90% 50%)",  // cyan
  "hsl(330 80% 55%)",  // pink
  "hsl(45 93% 47%)",   // yellow
];

export const SalesTrendByStation = ({ rawChartEntries, stations }: SalesTrendByStationProps) => {
  const [viewMode, setViewMode] = useState<"amount" | "liters">("amount");

  const { chartData, stationNames } = useMemo(() => {
    if (!rawChartEntries || rawChartEntries.length === 0) {
      return { chartData: [], stationNames: [] };
    }

    // Build a map: date -> stationName -> value
    const dateStationMap = new Map<string, Map<string, number>>();
    const stationNameSet = new Set<string>();

    for (const entry of rawChartEntries) {
      const s1 = entry.super1_index_arrivee - entry.super1_index_depart;
      const s2 = entry.super2_index_arrivee - entry.super2_index_depart;
      const g1 = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
      const g2 = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
      const superL = (s1 > 0 ? s1 : 0) + (s2 > 0 ? s2 : 0);
      const gasoilL = (g1 > 0 ? g1 : 0) + (g2 > 0 ? g2 : 0);

      const value = viewMode === "amount"
        ? superL * 695 + gasoilL * 720
        : superL + gasoilL;

      const stationInfo = entry.stations as any;
      const name = stationInfo?.name || "Inconnu";
      stationNameSet.add(name);

      if (!dateStationMap.has(entry.entry_date)) {
        dateStationMap.set(entry.entry_date, new Map());
      }
      const stationMap = dateStationMap.get(entry.entry_date)!;
      stationMap.set(name, (stationMap.get(name) || 0) + value);
    }

    const names = Array.from(stationNameSet).sort();

    const data = Array.from(dateStationMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stationMap]) => {
        const point: Record<string, any> = {
          date: new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
        };
        for (const name of names) {
          point[name] = stationMap.get(name) || 0;
        }
        return point;
      });

    return { chartData: data, stationNames: names };
  }, [rawChartEntries, viewMode]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-xl max-w-xs">
          <p className="font-display font-semibold mb-2">{label}</p>
          {payload
            .filter((entry: any) => entry.value > 0)
            .sort((a: any, b: any) => b.value - a.value)
            .map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground truncate">{entry.name}:</span>
                <span className="font-medium">
                  {viewMode === "amount"
                    ? formatCurrency(entry.value)
                    : `${entry.value.toLocaleString("fr-FR")} L`}
                </span>
              </div>
            ))}
        </div>
      );
    }
    return null;
  };

  if (chartData.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-display font-semibold mb-6">
          Tendance des ventes par station (30 jours)
        </h3>
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
          Aucune donnée disponible sur les 30 derniers jours.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h3 className="text-lg font-display font-semibold">
          Tendance des ventes par station (30 jours)
        </h3>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "amount" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("amount")}
          >
            Montants (FCFA)
          </Button>
          <Button
            variant={viewMode === "liters" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("liters")}
          >
            Litres
          </Button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 25%)" />
          <XAxis
            dataKey="date"
            stroke="hsl(215 20% 65%)"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            stroke="hsl(215 20% 65%)"
            fontSize={12}
            tickLine={false}
            tickFormatter={(value) =>
              viewMode === "amount"
                ? `${(value / 1000000).toFixed(1)}M`
                : `${(value / 1000).toFixed(0)}k`
            }
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">{value}</span>
            )}
          />
          {stationNames.map((name, idx) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={STATION_COLORS[idx % STATION_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};