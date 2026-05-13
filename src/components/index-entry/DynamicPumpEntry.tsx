import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel, Gauge } from "lucide-react";
import { formatNumber } from "@/data/stationsData";
import type { Pump } from "@/hooks/usePumps";
import type { Tank } from "@/hooks/useTanks";

export interface PumpRow {
  pumpId: string;
  tankId: string | null;
  productType: "super" | "gasoil";
  indexDepart: string;
  indexArrivee: string;
}

export interface TankJauge {
  tankId: string;
  productType: "super" | "gasoil";
  jauge: string;
}

interface Props {
  pumps: Pump[];
  tanks: Tank[];
  pumpRows: Record<string, PumpRow>;
  tankJauges: Record<string, TankJauge>;
  previousIndex: Record<string, number>;
  hasPrevious: boolean;
  onChangePump: (pumpId: string, patch: Partial<PumpRow>) => void;
  onChangeJauge: (tankId: string, value: string) => void;
  disabled?: boolean;
}

export const DynamicPumpEntry = ({
  pumps,
  tanks,
  pumpRows,
  tankJauges,
  previousIndex,
  hasPrevious,
  onChangePump,
  onChangeJauge,
  disabled,
}: Props) => {
  // Group pumps by tank (or "no-tank" bucket)
  const groups = useMemo(() => {
    const byTank = new Map<string | "none", { tank: Tank | null; pumps: Pump[] }>();
    for (const t of tanks) byTank.set(t.id, { tank: t, pumps: [] });
    for (const p of pumps) {
      const key = p.tank_id || "none";
      if (!byTank.has(key)) byTank.set(key, { tank: null, pumps: [] });
      byTank.get(key)!.pumps.push(p);
    }
    return Array.from(byTank.entries())
      .filter(([, g]) => g.pumps.length > 0)
      .sort(([, a], [, b]) => {
        const ap = a.tank?.product_type ?? "zz";
        const bp = b.tank?.product_type ?? "zz";
        if (ap !== bp) return ap.localeCompare(bp);
        return (a.tank?.name || "").localeCompare(b.tank?.name || "");
      });
  }, [pumps, tanks]);

  // Auto-fill index départ from previousIndex when row depart is empty
  useEffect(() => {
    if (!hasPrevious) return;
    for (const p of pumps) {
      const row = pumpRows[p.id];
      const prev = previousIndex[p.id];
      if (prev != null && (!row || row.indexDepart === "" || row.indexDepart === "0")) {
        onChangePump(p.id, { indexDepart: String(prev) });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousIndex, pumps, hasPrevious]);

  return (
    <div className="space-y-6">
      {groups.map(([key, g]) => {
        const tank = g.tank;
        const product = (tank?.product_type ?? g.pumps[0].product_type) as "super" | "gasoil";
        const colorClass = product === "super" ? "super" : "gasoil";

        // Cumul sortie pour cette cuve = somme (arrivée - départ) sur ses pompes
        const cumul = g.pumps.reduce((acc, p) => {
          const row = pumpRows[p.id];
          if (!row) return acc;
          const a = parseFloat(row.indexArrivee) || 0;
          const d = parseFloat(row.indexDepart) || 0;
          return acc + Math.max(0, a - d);
        }, 0);

        const capacity = tank?.capacity_liters ?? 0;
        const ratio = capacity > 0 ? Math.min(100, (cumul / capacity) * 100) : 0;

        return (
          <Card key={String(key)} className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${colorClass}`} />
                  {tank ? `Cuve ${tank.name}` : "Pompes sans cuve"}
                  <span className="text-xs uppercase tracking-wider text-muted-foreground ml-1">
                    ({product})
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Sortie cumulée :</span>
                  <span className="font-bold text-success">+{formatNumber(cumul)} L</span>
                  {capacity > 0 && (
                    <span className="text-xs text-muted-foreground">
                      / {formatNumber(capacity)} L cap.
                    </span>
                  )}
                </div>
              </div>
              {capacity > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full bg-${colorClass}`}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pompes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {g.pumps.map((p) => {
                  const row = pumpRows[p.id] || {
                    pumpId: p.id,
                    tankId: p.tank_id,
                    productType: p.product_type,
                    indexDepart: "",
                    indexArrivee: "",
                  };
                  const liters = Math.max(
                    0,
                    (parseFloat(row.indexArrivee) || 0) - (parseFloat(row.indexDepart) || 0),
                  );
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium">
                          <Fuel className={`w-4 h-4 text-${colorClass}`} />
                          {p.name}
                        </div>
                        {liters > 0 && (
                          <span className="text-xs text-success font-medium">
                            +{formatNumber(liters)} L
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Index Départ {hasPrevious && "(veille)"}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.indexDepart}
                            readOnly={hasPrevious}
                            disabled={disabled}
                            onChange={(e) => onChangePump(p.id, { indexDepart: e.target.value })}
                            className={`h-9 ${
                              hasPrevious
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-background"
                            }`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Index Arrivée</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.indexArrivee}
                            disabled={disabled}
                            onChange={(e) => onChangePump(p.id, { indexArrivee: e.target.value })}
                            className="h-9 bg-background"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Jauge par cuve */}
              {tank && (
                <div className="rounded-lg border border-border bg-secondary/30 p-3 flex items-center gap-3">
                  <Gauge className={`w-5 h-5 text-${colorClass} shrink-0`} />
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">
                      Jauge cuve {tank.name} (L)
                    </Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="0"
                      value={tankJauges[tank.id]?.jauge ?? ""}
                      disabled={disabled}
                      onChange={(e) => onChangeJauge(tank.id, e.target.value)}
                      className="h-9 bg-background mt-1"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
