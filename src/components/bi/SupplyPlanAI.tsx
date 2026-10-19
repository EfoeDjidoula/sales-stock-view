import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { computeSupplyNeeds, TARGET_COVERAGE_DAYS, FILL_TARGET_PCT, type TruckCapacity } from "@/lib/metrics/supplyPlanning";
import { daysBetween, type Dataset } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Sparkles, Truck } from "lucide-react";

type Plan = { summary: string; trips: any[]; unserved: any[]; warnings: string[] };
const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: d }));

export function SupplyPlanAI({ d, tenantId, countryIds, start, end }: { d: Dataset; tenantId: string; countryIds: string[]; start: string; end: string }) {
  const { t } = useLanguage();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fleet = useQuery({
    queryKey: ["bi-fleet", tenantId, countryIds],
    queryFn: async () => {
      const sb = supabase as any;
      const [v, c, s] = await Promise.all([
        sb.from("logistics_vehicles").select("id,registration,capacity_litres,status,kind").eq("tenant_id", tenantId).in("country_id", countryIds).eq("status", "active"),
        sb.from("logistics_compartments").select("vehicle_id,position,capacity_litres").eq("tenant_id", tenantId).in("country_id", countryIds),
        sb.from("supply_requests").select("station_id,product_id,status,qty_requested,qty_approved,qty_loaded").eq("tenant_id", tenantId).in("country_id", countryIds).not("status", "in", "(received,cancelled,rejected,draft)"),
      ]);
      const comps = (c.data ?? []) as any[];
      const trucks: TruckCapacity[] = ((v.data ?? []) as any[]).filter((x) => x.kind !== "tractor").map((x) => {
        const cs = comps.filter((k) => k.vehicle_id === x.id).sort((a, b) => a.position - b.position).map((k) => Number(k.capacity_litres));
        return { id: x.id, registration: x.registration, capacity: cs.reduce((a, b) => a + b, 0) || Number(x.capacity_litres), compartments: cs };
      }).filter((x) => x.compartments.length > 0);
      return { trucks, openSupplies: (s.data ?? []) as any[] };
    },
  });

  const needs = useMemo(() => fleet.data ? computeSupplyNeeds({ ...d, openSupplies: fleet.data.openSupplies }, start, end, daysBetween(start, end)) : [], [d, fleet.data, start, end]);

  const run = async () => {
    setLoading(true); setError(null); setPlan(null);
    const { data, error: e } = await supabase.functions.invoke("suggest-supply-plan", {
      body: { today: new Date().toISOString().slice(0, 10), trucks: fleet.data?.trucks ?? [],
        needs: needs.map((n) => ({ station: n.stationName, product: n.kind, stock: n.stock, capacity: n.capacity, avgDaily: n.avgDaily, coverageDays: n.coverageDays, inTransit: n.inTransit, needLitres: n.needLitres, urgency: n.urgency })) },
    });
    setLoading(false);
    if (e || (data as any)?.error) {
      let msg = (data as any)?.error;
      try { msg = msg ?? (await (e as any)?.context?.json())?.error; } catch { /* ignore */ }
      setError(msg ?? t("Erreur du service IA.")); return;
    }
    setPlan(data as Plan);
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("Besoins calculés")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t(`Règle : couverture (stock + en route) < ${TARGET_COVERAGE_DAYS} j de ventes moyennes ; besoin = ${FILL_TARGET_PCT} % de la capacité − stock − en route.`)}</p>
          </div>
          <Button onClick={run} disabled={loading || !needs.length || !fleet.data?.trucks.length} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{t("Suggérer les transports")}
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Station</TableHead><TableHead>{t("Produit")}</TableHead><TableHead className="text-right">Stock (L)</TableHead><TableHead className="text-right">{t("Ventes/j")}</TableHead><TableHead className="text-right">{t("Couverture")}</TableHead><TableHead className="text-right">{t("En route")}</TableHead><TableHead className="text-right">{t("Besoin")} (L)</TableHead><TableHead>{t("Urgence")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {needs.map((n) => (
                <TableRow key={n.stationId + n.kind}>
                  <TableCell className="font-medium">{n.stationName}</TableCell><TableCell>{n.kind === "gasoil" ? "Gasoil" : "Super"}</TableCell>
                  <TableCell className="text-right">{fmt(n.stock)} / {fmt(n.capacity)}</TableCell><TableCell className="text-right">{fmt(n.avgDaily)}</TableCell>
                  <TableCell className="text-right">{n.coverageDays == null ? t("sans ventes") : `${fmt(n.coverageDays, 1)} j`}</TableCell><TableCell className="text-right">{fmt(n.inTransit)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(n.needLitres)}</TableCell>
                  <TableCell><Badge variant={n.urgency === "haute" ? "destructive" : n.urgency === "moyenne" ? "default" : "secondary"}>{t(n.urgency)}</Badge></TableCell>
                </TableRow>
              ))}
              {!needs.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{fleet.isLoading ? t("Chargement…") : t("Aucun besoin : toutes les stations sont couvertes.")}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="p-3 text-xs text-muted-foreground">{t("Camions disponibles avec compartiments")} : {fleet.data?.trucks.map((x) => `${x.registration} (${fmt(x.capacity)} L)`).join(", ") || "—"}</p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {plan && (
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />{t("Plan suggéré par l'IA")}</CardTitle>
            <p className="text-sm text-muted-foreground">{plan.summary}</p>
            <p className="text-xs text-muted-foreground">{t("Suggestion à valider : créez ensuite la demande et le transport dans Logistique & Flux, où le chargement plein est contrôlé.")}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.trips.map((tr, i) => {
              const tot = (tr.loads ?? []).reduce((s: number, l: any) => s + (Number(l.litres) || 0), 0);
              const cap = fleet.data?.trucks.find((x) => x.registration === tr.truck)?.capacity;
              return (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>#{tr.priority ?? i + 1}</Badge><Truck className="w-4 h-4" /><span className="font-semibold">{tr.truck}</span>
                    <Badge variant="secondary">{tr.mode}</Badge><span className="text-xs text-muted-foreground">{tr.planned_date}</span>
                    <span className="ml-auto text-sm">{fmt(tot)} / {fmt(cap)} L</span>
                    {cap != null && tot !== cap && <Badge variant="destructive">{t("Pas à pleine capacité")}</Badge>}
                  </div>
                  <div className="grid gap-1 text-sm">{(tr.loads ?? []).map((l: any, j: number) => <div key={j}>C{l.compartment} · {fmt(Number(l.litres))} L {l.product} → <b>{l.station}</b></div>)}</div>
                  <p className="text-xs text-muted-foreground">{tr.reason}</p>
                </div>
              );
            })}
            {plan.unserved.length > 0 && <div className="text-sm"><p className="font-medium">{t("Non servis")}</p>{plan.unserved.map((u, i) => <p key={i} className="text-muted-foreground">{u.station} · {u.product} · {fmt(Number(u.litres))} L — {u.reason}</p>)}</div>}
            {plan.warnings.map((w, i) => <p key={i} className="text-xs text-warning">⚠ {w}</p>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
