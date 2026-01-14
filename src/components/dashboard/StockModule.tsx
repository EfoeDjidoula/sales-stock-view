import { Station, stations, formatNumber } from "@/data/stationsData";
import { StockGauge } from "./StockGauge";
import { Fuel, Droplet, AlertTriangle } from "lucide-react";

interface StockModuleProps {
  station: Station | null;
}

export const StockModule = ({ station }: StockModuleProps) => {
  const displayStations = station ? [station] : stations;

  const getTotalStock = (product: string) => {
    return displayStations.reduce((total, s) => {
      return (
        total +
        s.currentStock
          .filter((stock) => stock.tank.toLowerCase().includes(product.toLowerCase()))
          .reduce((sum, stock) => sum + stock.closingStock, 0)
      );
    }, 0);
  };

  const getTotalCapacity = (product: string) => {
    return displayStations.reduce((total, s) => {
      return (
        total +
        s.currentStock
          .filter((stock) => stock.tank.toLowerCase().includes(product.toLowerCase()))
          .reduce((sum, stock) => sum + stock.capacity, 0)
      );
    }, 0);
  };

  const getLowStockAlerts = () => {
    const alerts: { station: string; tank: string; percentage: number }[] = [];
    displayStations.forEach((s) => {
      s.currentStock.forEach((stock) => {
        const percentage = (stock.closingStock / stock.capacity) * 100;
        if (percentage <= 25) {
          alerts.push({
            station: s.name,
            tank: stock.tank,
            percentage: Math.round(percentage),
          });
        }
      });
    });
    return alerts;
  };

  const superStock = getTotalStock("super");
  const superCapacity = getTotalCapacity("super");
  const gasoilStock = getTotalStock("gasoil");
  const gasoilCapacity = getTotalCapacity("gasoil");
  const lowStockAlerts = getLowStockAlerts();

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-super/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-super/10">
              <Fuel className="w-5 h-5 text-super" />
            </div>
            <div>
              <h4 className="font-display font-semibold">Stock Super</h4>
              <p className="text-sm text-muted-foreground">Tous les réservoirs</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Disponible</span>
              <span className="font-bold">{formatNumber(superStock)} L</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-super rounded-full transition-all duration-500"
                style={{ width: `${(superStock / superCapacity) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>{formatNumber(superCapacity)} L</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-gasoil/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-gasoil/10">
              <Droplet className="w-5 h-5 text-gasoil" />
            </div>
            <div>
              <h4 className="font-display font-semibold">Stock Gasoil</h4>
              <p className="text-sm text-muted-foreground">Tous les réservoirs</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Disponible</span>
              <span className="font-bold">{formatNumber(gasoilStock)} L</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gasoil rounded-full transition-all duration-500"
                style={{ width: `${(gasoilStock / gasoilCapacity) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span>{formatNumber(gasoilCapacity)} L</span>
            </div>
          </div>
        </div>
      </div>

      {/* Low stock alerts */}
      {lowStockAlerts.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h4 className="font-display font-semibold text-destructive">
              Alertes Stock Bas ({lowStockAlerts.length})
            </h4>
          </div>
          <div className="space-y-2">
            {lowStockAlerts.slice(0, 3).map((alert, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-sm bg-card/50 rounded-lg px-3 py-2"
              >
                <span>
                  <span className="font-medium">{alert.station}</span>
                  <span className="text-muted-foreground"> - {alert.tank}</span>
                </span>
                <span className="font-bold text-destructive">{alert.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed stock by station */}
      <div className="space-y-4">
        <h3 className="text-lg font-display font-semibold">
          Détail par réservoir
        </h3>
        {displayStations.map((s) => (
          <div key={s.id} className="space-y-3">
            {!station && (
              <h4 className="text-sm font-medium text-primary uppercase tracking-wider">
                {s.name}
              </h4>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {s.currentStock.map((stock, index) => (
                <StockGauge
                  key={`${s.id}-${index}`}
                  tank={stock.tank}
                  capacity={stock.capacity}
                  currentStock={stock.closingStock}
                  product={stock.tank.toLowerCase().includes("super") ? "super" : "gasoil"}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
