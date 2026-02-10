import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/data/stationsData";

interface SalesChartProps {
  chartData: { date: string; super: number; gasoil: number; total: number }[];
}

export const SalesChart = ({ chartData }: SalesChartProps) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-xl">
          <p className="font-display font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground capitalize">{entry.name}:</span>
              <span className="font-medium">{formatCurrency(entry.value)}</span>
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
          Évolution des ventes
        </h3>
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
          Aucune donnée disponible. Importez un fichier Excel pour voir l'évolution.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-lg font-display font-semibold mb-6">
        Évolution des ventes
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="superGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gasoilGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-sm capitalize text-muted-foreground">{value}</span>
            )}
          />
          <Area
            type="monotone"
            dataKey="super"
            name="Super"
            stroke="hsl(38 92% 50%)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#superGradient)"
          />
          <Area
            type="monotone"
            dataKey="gasoil"
            name="Gasoil"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gasoilGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
