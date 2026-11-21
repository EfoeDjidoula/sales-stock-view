import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addTotals, emptyTotals, groupStocks, supplyStocks, type SupplyRow } from "@/lib/threeStocks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
const sign = (v: number) => (v > 0 ? "+" : "") + fmt(v);

/** Bilan Commandé → Enlevé (BL) → Réceptionné ; lecture seule, périmètre tenant + pays. */
export const ThreeStocksTab = () => {
  const { language } = useLanguage();
  const L = (fr: string, en: string) => (language === "en" ? en : fr);
  const { scopeQuery, tenantId, countryId } = useScope();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<SupplyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true); setErr(null);
    scopeQuery(db.from("supply_requests").select("id, reference, status, created_at, qty_requested, qty_approved, qty_loaded, qty_received, stations(name), petroleum_products(name)"))
      .gte("created_at", from).lte("created_at", `${to}T23:59:59`).order("created_at", { ascending: false }).limit(1000)
      .then(({ data, error }: { data: any[] | null; error: any }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        setLoading(false);
        if (error) { setErr(error.message); return; }
        setRows((data ?? []).map((r) => ({ ...r, product: r.petroleum_products?.name ?? "—", station: r.stations?.name ?? "—", date: r.created_at })));
      });
  }, [tenantId, countryId, from, to, scopeQuery]);

  const total = useMemo(() => rows.reduce((a, r) => addTotals(a, supplyStocks(r)), emptyTotals()), [rows]);
  const byProduct = useMemo(() => [...groupStocks(rows, (r) => r.product)].sort(), [rows]);
  const active = rows.filter((r) => supplyStocks(r).count > 0);

  const kpis: [string, number, string][] = [
    [L("1. Commandé non enlevé", "1. Ordered, not lifted"), total.openOrdered, L("Fournisseur / dépôt", "Supplier / depot")],
    [L("2. En transit (BL)", "2. In transit (BL)"), total.inTransit, L("Camions sur la route", "Trucks on the road")],
    [L("3. Réceptionné (BL)", "3. Received (BL)"), total.receivedBL, L("Comptabilisé en cuves", "Booked into tanks")],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>{L("Du", "From")}</Label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>{L("Au", "To")}</Label><Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground max-w-xl">{L("Les réceptions sont comptées au volume BL chargé ; la jauge sert uniquement à mesurer l'écart camion.", "Receipts are booked at BL loaded volume; the gauge only measures the truck variance.")}</p>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {kpis.map(([l, v, s]) => (
          <Card key={l} className="glass-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            {loading ? <Skeleton className="h-8 w-28 mt-1" /> : <div className="text-2xl font-bold font-display">{fmt(v)} L</div>}
            <div className="text-xs text-muted-foreground">{s}</div>
          </CardContent></Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="glass-card"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{L("Écart dépôt (enlevé − commandé)", "Depot variance (lifted − ordered)")}</div><div className={`text-xl font-bold ${total.depotVariance < 0 ? "text-destructive" : ""}`}>{sign(total.depotVariance)} L</div></CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{L("Écart camion (jaugé − BL)", "Truck variance (gauged − BL)")}</div><div className={`text-xl font-bold ${total.truckVariance < 0 ? "text-destructive" : ""}`}>{sign(total.truckVariance)} L</div></CardContent></Card>
      </div>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">{L("Bilan par produit", "By product")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("Produit", "Product")}</TableHead><TableHead className="text-right">{L("Commandé", "Ordered")}</TableHead>
              <TableHead className="text-right">{L("Non enlevé", "Not lifted")}</TableHead><TableHead className="text-right">{L("En transit", "In transit")}</TableHead>
              <TableHead className="text-right">{L("Réceptionné BL", "Received BL")}</TableHead><TableHead className="text-right">{L("Jaugé", "Gauged")}</TableHead>
              <TableHead className="text-right">{L("Écart dépôt", "Depot var.")}</TableHead><TableHead className="text-right">{L("Écart camion", "Truck var.")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {byProduct.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{L("Aucun approvisionnement sur la période", "No supply in period")}</TableCell></TableRow>}
              {byProduct.map(([p, t]) => (
                <TableRow key={p}><TableCell className="font-medium">{p}</TableCell>
                  <TableCell className="text-right">{fmt(t.ordered)}</TableCell><TableCell className="text-right">{fmt(t.openOrdered)}</TableCell>
                  <TableCell className="text-right">{fmt(t.inTransit)}</TableCell><TableCell className="text-right">{fmt(t.receivedBL)}</TableCell>
                  <TableCell className="text-right">{fmt(t.receivedGauge)}</TableCell><TableCell className="text-right">{sign(t.depotVariance)}</TableCell>
                  <TableCell className={`text-right ${t.truckVariance < 0 ? "text-destructive" : ""}`}>{sign(t.truckVariance)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">{L("Traçabilité par approvisionnement", "Per-supply traceability")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("Référence", "Reference")}</TableHead><TableHead>{L("Station", "Station")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead>
              <TableHead>{L("Étape", "Stage")}</TableHead><TableHead className="text-right">{L("Commandé", "Ordered")}</TableHead>
              <TableHead className="text-right">{L("Enlevé (BL)", "Lifted (BL)")}</TableHead><TableHead className="text-right">{L("Jaugé", "Gauged")}</TableHead>
              <TableHead className="text-right">{L("Écart camion", "Truck var.")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {active.map((r) => { const t = supplyStocks(r); const stage = t.receivedBL ? ["3", L("Réceptionné", "Received")] : t.inTransit ? ["2", L("En transit", "In transit")] : ["1", L("Commandé", "Ordered")];
                return (
                  <TableRow key={r.id}><TableCell className="font-mono text-xs">{(r as any).reference}</TableCell>{/* eslint-disable-line @typescript-eslint/no-explicit-any */}
                    <TableCell>{r.station}</TableCell><TableCell>{r.product}</TableCell>
                    <TableCell><Badge variant={stage[0] === "3" ? "default" : "outline"}>{stage[0]}. {stage[1]}</Badge></TableCell>
                    <TableCell className="text-right">{fmt(t.ordered)}</TableCell><TableCell className="text-right">{t.loaded ? fmt(t.loaded) : "—"}</TableCell>
                    <TableCell className="text-right">{t.receivedBL ? fmt(t.receivedGauge) : "—"}</TableCell>
                    <TableCell className={`text-right ${t.truckVariance < 0 ? "text-destructive" : ""}`}>{t.receivedBL ? sign(t.truckVariance) : "—"}</TableCell></TableRow>
                ); })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
