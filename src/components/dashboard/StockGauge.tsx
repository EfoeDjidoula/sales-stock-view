import { cn } from "@/lib/utils";
import { formatNumber } from "@/data/stationsData";

interface StockGaugeProps {
  tank: string;
  capacity: number;
  currentStock: number;
  product: "super" | "gasoil";
}

export const StockGauge = ({ tank, capacity, currentStock, product }: StockGaugeProps) => {
  const percentage = Math.round((currentStock / capacity) * 100);

  const getStatusColor = () => {
    if (percentage <= 20) return "bg-destructive";
    if (percentage <= 40) return "bg-warning";
    return "bg-success";
  };

  const getStatusText = () => {
    if (percentage <= 20) return "Critique";
    if (percentage <= 40) return "Bas";
    if (percentage <= 70) return "Moyen";
    return "Bon";
  };

  const productColor = product === "super" ? "bg-super" : "bg-gasoil";

  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">{tank}</p>
          <span
            className={cn(
              "inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium",
              product === "super"
                ? "bg-super/20 text-super"
                : "bg-gasoil/20 text-gasoil"
            )}
          >
            {product === "super" ? "Super" : "Gasoil"}
          </span>
        </div>
        <span
          className={cn(
            "px-2 py-1 rounded-md text-xs font-semibold",
            percentage <= 20
              ? "bg-destructive/20 text-destructive"
              : percentage <= 40
              ? "bg-warning/20 text-warning"
              : "bg-success/20 text-success"
          )}
        >
          {getStatusText()}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 bg-secondary rounded-full overflow-hidden mb-3">
        <div
          className={cn("h-full rounded-full transition-all duration-500", productColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {/* Threshold markers */}
        <div className="absolute top-0 left-[20%] w-px h-full bg-foreground/20" />
        <div className="absolute top-0 left-[40%] w-px h-full bg-foreground/20" />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {formatNumber(currentStock)} L / {formatNumber(capacity)} L
        </span>
        <span className="font-bold text-foreground">{percentage}%</span>
      </div>
    </div>
  );
};
