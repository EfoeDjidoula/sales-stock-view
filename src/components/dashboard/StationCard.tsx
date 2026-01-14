import { Station, formatCurrency, getStationTotalSales } from "@/data/stationsData";
import { MapPin, Fuel, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface StationCardProps {
  station: Station;
  period: "day" | "week" | "month";
  onClick: () => void;
  isSelected?: boolean;
}

export const StationCard = ({ station, period, onClick, isSelected }: StationCardProps) => {
  const totalSales = getStationTotalSales(station, period);
  const totalStock = station.currentStock.reduce((sum, s) => sum + s.closingStock, 0);
  const totalCapacity = station.currentStock.reduce((sum, s) => sum + s.capacity, 0);
  const stockPercentage = Math.round((totalStock / totalCapacity) * 100);

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
          <h3 className="font-display font-bold text-lg">{station.name}</h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {station.location}
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

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  stockPercentage > 50 ? "bg-success" : stockPercentage > 25 ? "bg-warning" : "bg-destructive"
                )}
                style={{ width: `${stockPercentage}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Stock: {stockPercentage}%
          </span>
        </div>
      </div>
    </button>
  );
};
