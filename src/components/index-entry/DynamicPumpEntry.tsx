import { useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fuel, Gauge, Truck, AlertTriangle } from "lucide-react";
import { formatNumber } from "@/data/stationsData";
import type { Pump } from "@/hooks/usePumps";
import type { Tank } from "@/hooks/useTanks";
import type { TankDayContext } from "@/hooks/useIndexDailyContext";
import { nozzleOutput, num, tankBalance } from "@/lib/indexModel";

export interface PumpRow {
  pumpId: string;
  tankId: string | null;
  productType: "super" | "gasoil";
  indexDepart: string;
  indexArrivee: string;
  /** Retour en cuve (L) saisi sur ce pistolet. */
  retour: string;
}

export interface TankJauge {
  tankId: string;
  productType: "super" | "gasoil";
  jauge: string;
  /** Stock d'ouverture saisi à la main (uniquement sans historique). */
  ouverture: string;
}

interface Props {
  pumps: Pump[];
  tanks: Tank[];
  pumpRows: Record<string, PumpRow>;
  tankJauges: Record<string, TankJauge>;
  tankContext: Record<string, TankDayContext>;
  previousIndex: Record<string, number>;
  hasPrevious: boolean;
  prices: { super: number; gasoil: number };
  onChangePump: (pumpId: string, patch: Partial<PumpRow>) => void;
  onChangeJauge: (tankId: string, patch: Partial<TankJauge>) => void;
  disabled?: boolean;
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v)}`;

export const DynamicPumpEntry = ({
  pumps,
  tanks,
  pumpRows,
  tankJauges,
  tankContext,
  previousIndex,
  hasPrevious,
  prices,
  onChangePump,
  onChangeJauge,
  disabled,
}: Props) => {
  // Ordre de saisie : SUPER d'abord, puis GASOIL ; pompes/cuves dédoublonnées par id
  const groups = useMemo(() => {
    const rank = (p?: string) => (p === "super" ? 0 : p === "gasoil" ? 1 : 2);
    const byTank = new Map<string | "none", { tank: Tank | null; pumps: Pump[] }>();
    for (const t of tanks) if (!byTank.has(t.id)) byTank.set(t.id, { tank: t, pumps: [] });
    const seen = new Set<string>();
    for (const p of pumps) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const key = p.tank_id || "none";
      if (!byTank.has(key)) byTank.set(key, { tank: null, pumps: [] });
      byTank.get(key)!.pumps.push(p);
    }
    for (const g of byTank.values()) {
      g.pumps.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    return Array.from(byTank.entries())
      .filter(([, g]) => g.pumps.length > 0)
      .sort(([, a], [, b]) => {
        const ap = rank(a.tank?.product_type ?? a.pumps[0]?.product_type);
        const bp = rank(b.tank?.product_type ?? b.pumps[0]?.product_type);
        if (ap !== bp) return ap - bp;
        return (a.tank?.name || "").localeCompare(b.tank?.name || "", undefined, { numeric: true });
      });
  }, [pumps, tanks]);

  // Index départ pré-rempli depuis l'index d'arrivée de la veille
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
        const pu = product === "super" ? prices.super : prices.gasoil;

        const calcs = g.pumps.map((p) => {
          const row = pumpRows[p.id];
          return nozzleOutput(num(row?.indexDepart), num(row?.indexArrivee), num(row?.retour));
        });
        const brutTotal = calcs.reduce((a, c) => a + c.brut, 0);
        const retourTotal = calcs.reduce((a, c) => a + c.retour, 0);
        const sortieTotal = calcs.reduce((a, c) => a + c.net, 0);

        const ctx = tank ? tankContext[tank.id] : undefined;
        const tj = tank ? tankJauges[tank.id] : undefined;
        const ouvertureKnown = ctx?.stockOuverture != null;
        const ouverture = ouvertureKnown ? (ctx!.stockOuverture as number) : num(tj?.ouverture);
        const jaugeFilled = !!tj?.jauge;
        const bal = tankBalance(ouverture, ctx?.depotage ?? 0, sortieTotal, num(tj?.jauge));
        const capacity = tank?.capacity_liters ?? 0;

        return (
          <Card key={String(key)} className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-${colorClass}`} />
                  {tank ? `Cuve ${tank.name}` : "Pompes sans cuve"}
                  <span className="text-xs uppercase tracking-wider text-muted-foreground ml-1">({product})</span>
                  {capacity > 0 && (
                    <span className="text-xs text-muted-foreground">· {formatNumber(capacity)} L</span>
                  )}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">
                    Quantité <span className="font-semibold text-foreground">{formatNumber(brutTotal)} L</span>
                  </span>
                  <span className="text-muted-foreground">
                    Retour <span className="font-semibold text-foreground">{formatNumber(retourTotal)} L</span>
                  </span>
                  <span className="text-muted-foreground">
                    Sortie réelle <span className="font-bold text-success">{formatNumber(sortieTotal)} L</span>
                  </span>
                  <span className="text-muted-foreground">
                    Montant <span className="font-semibold text-primary">{formatNumber(sortieTotal * pu)} FCFA</span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pistolets */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {g.pumps.map((p, i) => {
                  const row = pumpRows[p.id] || {
                    pumpId: p.id,
                    tankId: p.tank_id,
                    productType: p.product_type,
                    indexDepart: "",
                    indexArrivee: "",
                    retour: "",
                  };
                  const c = calcs[i];
                  return (
                    <div key={p.id} className="rounded-lg border border-border bg-secondary/40 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium">
                          <Fuel className={`w-4 h-4 text-${colorClass}`} />
                          {p.name}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(c.brut)} L − {formatNumber(c.retour)} L ={" "}
                          <span className="font-semibold text-success">{formatNumber(c.net)} L</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Index départ {hasPrevious && "(veille)"}
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
                            className={`h-9 ${hasPrevious ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background"}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Index arrivée</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={row.indexArrivee}
                            disabled={disabled}
                            onChange={(e) => onChangePump(p.id, { indexArrivee: e.target.value })}
                            className={`h-9 bg-background ${c.indexInvalide ? "border-destructive" : ""}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Retour en cuve (L)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            value={row.retour}
                            disabled={disabled}
                            onChange={(e) => onChangePump(p.id, { retour: e.target.value })}
                            className={`h-9 bg-background ${c.retourInvalide ? "border-destructive" : ""}`}
                          />
                        </div>
                      </div>
                      {(c.indexInvalide || c.retourInvalide) && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {c.indexInvalide
                            ? "L'index d'arrivée est inférieur à l'index de départ."
                            : "Le retour en cuve dépasse la quantité débitée."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bilan cuve */}
              {tank && (
                <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Gauge className={`w-4 h-4 text-${colorClass}`} /> Suivi stock — cuve {tank.name}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Stock ouverture (L)</Label>
                      {ouvertureKnown ? (
                        <div className="h-9 rounded-md bg-muted px-3 flex items-center font-medium" title={ctx?.ouvertureSource || ""}>
                          {formatNumber(ouverture)}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={tj?.ouverture ?? ""}
                          disabled={disabled}
                          onChange={(e) => onChangeJauge(tank.id, { ouverture: e.target.value })}
                          className="h-9 bg-background"
                        />
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {ouvertureKnown ? ctx?.ouvertureSource : "Aucun historique : saisie initiale"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dépotage (L)</Label>
                      <div className="h-9 rounded-md bg-muted px-3 flex items-center font-medium">
                        {formatNumber(bal.depotage)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">Réceptions validées</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sortie (L)</Label>
                      <div className="h-9 rounded-md bg-muted px-3 flex items-center font-medium">
                        {formatNumber(bal.sortie)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">Sorties réelles pistolets</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Stock clôture théorique</Label>
                      <div className="h-9 rounded-md bg-muted px-3 flex items-center font-semibold">
                        {formatNumber(bal.stockCloture)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Jauge du jour (L)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="0"
                        value={tj?.jauge ?? ""}
                        disabled={disabled}
                        onChange={(e) => onChangeJauge(tank.id, { jauge: e.target.value })}
                        className="h-9 bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Écart sur stock (L)</Label>
                      <div
                        className={`h-9 rounded-md px-3 flex items-center font-bold ${
                          !jaugeFilled
                            ? "bg-muted text-muted-foreground"
                            : bal.ecart < 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-success/10 text-success"
                        }`}
                      >
                        {jaugeFilled ? signed(bal.ecart) : "—"}
                      </div>
                    </div>
                  </div>
                  {ctx && ctx.receptions.length > 0 && (
                    <div className="space-y-1">
                      {ctx.receptions.map((r) => (
                        <div key={r.reference} className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3">
                          <Truck className="w-3.5 h-3.5 text-primary" />
                          <span className="font-medium text-foreground">{r.reference}</span>
                          {r.bl && <span>BL {r.bl}</span>}
                          {r.driver && <span>Chauffeur : {r.driver}</span>}
                          <span>{formatNumber(r.qty)} L réceptionnés</span>
                          {r.variance != null && <span>Écart après dépotage : {signed(r.variance)} L</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
