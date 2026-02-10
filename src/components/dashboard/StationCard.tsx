import { MapPin, Fuel, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/data/stationsData";

interface StationCardProps {
  stationId: string;
  name: string;
  location: string;
  totalSales: number;
  superJauge: number;
  gasoilJauge: number;
  period: "day" | "week" | "month";
  onClick: () => void;
  isSelected?: boolean;
}

export const StationCard = ({
  stationId,
  name,
  location,
  totalSales,
  superJauge,
  gasoilJauge,
  period,
  onClick,
  isSelected,
}: StationCardProps) => {
  const totalStock = superJauge + gasoilJauge;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-card rounded-xl border p-5 transition-all duration-300 hover:scale-[1.02] hover:border-primary/50",
        isSelected ? "border-primary glow-primary" : "border-border"
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-lg">{name}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {location}
          </div>
        </div>
        <div className="p-2 rounded-lg bg-primary/10">
          <Fuel className="w-5 h-5 text-primary" />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Ventes {period === "day" ? "du jour" : period === "week" ? "de la semaine" : "du mois"}
          </p>
          <p className="text-xl font-display font-bold text-gradient">
            {formatCurrency(totalSales)}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Super: {superJauge.toFixed(0)}L jauge</span>
          <span>Gasoil: {gasoilJauge.toFixed(0)}L jauge</span>
        </div>
      </div>
    </button>
  );
};
