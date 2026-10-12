import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fmt = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const day = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
/** Tolérance d'écart de livraison (en %) au-delà de laquelle une alerte est levée. */
export const DELIVERY_TOLERANCE_PCT = 0.5;
export const variancePct = (expected: number, actual: number) => (expected > 0 ? ((actual - expected) / expected) * 100 : 0);

const LEVEL: Record<string, [string, string, "default" | "secondary" | "destructive" | "outline"]> = {
  normal: ["Normal", "Normal", "outline"], faible: ["Stock faible", "Low stock", "secondary"],
  critique: ["Critique", "Critical", "destructive"], rupture: ["Rupture", "Stock-out", "destructive"],
};

export const StationTrackingTab = ({ stations, products }: { stations: Row[]; products: Row[] }) => {
  const { language } = useLanguage();
  const L = (fr: string, en: string) => (language === "en" ? en : fr);
  const { tenantId, scopeQuery } = useScope();
  const [station, setStation] = useState<string>("all");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    const q = (t: string) => scopeQuery(db.from(t).select("*"));
    Promise.all([
      q("stock_levels").eq("location_type", "station"),
      q("supply_requests").gte("created_at", from).lte("created_at", `${to}T23:59:59`).order("created_at", { ascending: false }),
      q("logistics_trip_loads").not("station_id", "is", null),
      q("logistics_load_deliveries").gte("delivered_at", from).lte("delivered_at", `${to}T23:59:59`),
      scopeQuery(db.from("tanks").select("id,name")),
    ]).then(([s, r, l, dl, t]: Row[]) => {
      setData({ stock: s.data ?? [], supplies: r.data ?? [], loads: l.data ?? [], deliveries: dl.data ?? [], tanks: t.data ?? [] });
      setLoading(false);
    });
  }, [tenantId, scopeQuery, from, to]);

  const pName = (id?: string) => products.find((p) => p.id === id)?.name ?? "—";
  const sName = (id?: string) => stations.find((p) => p.id === id)?.name ?? "—";
  const tName = (id?: string) => (data.tanks ?? []).find((p) => p.id === id)?.name ?? "—";

  const summary = useMemo(() => {
    const loadById = new Map((data.loads ?? []).map((l) => [l.id, l]));
    return stations.map((st) => {
      const stock = (data.stock ?? []).filter((x) => x.station_id === st.id);
      const supplies = (data.supplies ?? []).filter((x) => x.station_id === st.id);
      const dels = (data.deliveries ?? []).map((x) => ({ ...x, load: loadById.get(x.load_id) })).filter((x) => x.load?.station_id === st.id);
      const qty = stock.reduce((a, x) => a + Number(x.theoretical ?? 0), 0);
      const cap = stock.reduce((a, x) => a + Number(x.capacity ?? 0), 0);
      const pending = supplies.filter((x) => !["received", "cancelled", "rejected"].includes(x.status));
      const expected = dels.reduce((a, x) => a + Number(x.load.qty_litres), 0);
      const delivered = dels.reduce((a, x) => a + Number(x.qty_delivered), 0);
      const recVar = supplies.reduce((a, x) => a + Number(x.delivery_variance ?? 0), 0);
      const alerts: string[] = [];
      stock.forEach((x) => { if (x.alert_level && x.alert_level !== "normal") alerts.push(`${tName(x.tank_id)} : ${L(...(LEVEL[x.alert_level] ?? LEVEL.normal).slice(0, 2) as [string, string])}`); });
      dels.forEach((x) => { const p = variancePct(Number(x.load.qty_litres), Number(x.qty_delivered)); if (Math.abs(p) > DELIVERY_TOLERANCE_PCT) alerts.push(L(`Écart livraison ${p.toFixed(2)} %`, `Delivery variance ${p.toFixed(2)}%`)); });
      supplies.forEach((x) => { const r = Number(x.qty_delivered ?? 0); if (r > 0 && Math.abs(variancePct(r, Number(x.qty_received ?? r))) > DELIVERY_TOLERANCE_PCT) alerts.push(L(`Écart réception ${x.reference}`, `Receipt variance ${x.reference}`)); });
      const worst = stock.some((x) => x.alert_level === "rupture") ? "rupture" : stock.some((x) => x.alert_level === "critique") ? "critique" : stock.some((x) => x.alert_level === "faible") ? "faible" : "normal";
      return { st, stock, supplies, pending, dels, qty, cap, expected, delivered, recVar, alerts, worst };
    });
  }, [stations, data, language]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = station === "all" ? summary : summary.filter((x) => x.st.id === station);
  const one = station !== "all" ? rows[0] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="grid gap-1"><Label className="text-xs">{L("Station", "Station")}</Label>
          <Select value={station} onValueChange={setStation}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{L("Toutes les stations", "All stations")}</SelectItem>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="grid gap-1"><Label className="text-xs">{L("Du", "From")}</Label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div className="grid gap-1"><Label className="text-xs">{L("Au", "To")}</Label><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : (
        <Card className="glass-card"><CardContent className="overflow-x-auto pt-4">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Station</TableHead><TableHead>{L("Stock (L)", "Stock (L)")}</TableHead><TableHead>{L("Remplissage", "Fill")}</TableHead>
              <TableHead>{L("Appro. en cours", "Open supplies")}</TableHead><TableHead>{L("Livré (L)", "Delivered (L)")}</TableHead>
              <TableHead>{L("Écart livraison", "Delivery variance")}</TableHead><TableHead>{L("Écart réception (L)", "Receipt variance (L)")}</TableHead><TableHead>{L("Alertes", "Alerts")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{L("Aucune station", "No stations")}</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.st.id} className="cursor-pointer" onClick={() => setStation(r.st.id)}>
                  <TableCell className="font-medium">{r.st.name}</TableCell>
                  <TableCell>{fmt(r.qty)}</TableCell>
                  <TableCell><Badge variant={LEVEL[r.worst][2]}>{r.cap ? `${Math.round((r.qty / r.cap) * 100)} %` : "—"} · {L(LEVEL[r.worst][0], LEVEL[r.worst][1])}</Badge></TableCell>
                  <TableCell>{r.pending.length}</TableCell>
                  <TableCell>{fmt(r.delivered)}</TableCell>
                  <TableCell>{r.expected ? `${fmt(r.delivered - r.expected)} (${variancePct(r.expected, r.delivered).toFixed(2)} %)` : "—"}</TableCell>
                  <TableCell>{fmt(r.recVar)}</TableCell>
                  <TableCell>{r.alerts.length ? <Badge variant="destructive">{r.alerts.length}</Badge> : <Badge variant="outline">0</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {one && !loading && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">{L("Stock par cuve", "Stock by tank")}</CardTitle></CardHeader><CardContent className="space-y-3">
            {one.stock.length === 0 && <p className="text-sm text-muted-foreground">{L("Aucun stock enregistré", "No stock recorded")}</p>}
            {one.stock.map((x, i) => { const pct = x.capacity ? Math.min(100, (Number(x.theoretical) / Number(x.capacity)) * 100) : 0; const lv = LEVEL[x.alert_level] ?? LEVEL.normal; return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm"><span>{tName(x.tank_id)} · {pName(x.product_id)}</span><Badge variant={lv[2]}>{L(lv[0], lv[1])}</Badge></div>
                <div className="h-2 rounded bg-secondary overflow-hidden"><div className={`h-full ${x.alert_level === "normal" ? "bg-primary" : "bg-destructive"}`} style={{ width: `${pct}%` }} /></div>
                <div className="text-xs text-muted-foreground">{fmt(x.theoretical)} / {fmt(x.capacity)} L · {L("seuil critique", "critical")} {fmt(x.critical_threshold)} L</div>
              </div>); })}
          </CardContent></Card>
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">{L("Alertes seuils", "Threshold alerts")}</CardTitle></CardHeader><CardContent>
            {one.alerts.length === 0 ? <p className="text-sm text-muted-foreground">{L("Aucune alerte", "No alerts")}</p> : <ul className="space-y-1 text-sm">{one.alerts.map((a, i) => <li key={i} className="text-destructive">• {a}</li>)}</ul>}
            <p className="text-xs text-muted-foreground mt-3">{L(`Tolérance écart livraison : ±${DELIVERY_TOLERANCE_PCT} %`, `Delivery tolerance: ±${DELIVERY_TOLERANCE_PCT}%`)}</p>
          </CardContent></Card>
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">{L("Approvisionnements", "Supplies")}</CardTitle></CardHeader><CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Réf.</TableHead><TableHead>{L("Produit", "Product")}</TableHead><TableHead>{L("Demandé", "Requested")}</TableHead><TableHead>{L("Réceptionné", "Received")}</TableHead><TableHead>{L("Écart", "Variance")}</TableHead><TableHead>{L("Statut", "Status")}</TableHead></TableRow></TableHeader>
              <TableBody>{one.supplies.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">—</TableCell></TableRow>}
                {one.supplies.map((x) => <TableRow key={x.id}><TableCell className="font-mono text-xs">{x.reference}</TableCell><TableCell>{pName(x.product_id)}</TableCell><TableCell>{fmt(x.qty_requested)}</TableCell><TableCell>{fmt(x.qty_received)}</TableCell><TableCell>{fmt(x.delivery_variance)}</TableCell><TableCell><Badge variant="outline">{x.status}</Badge></TableCell></TableRow>)}</TableBody></Table>
          </CardContent></Card>
          <Card className="glass-card"><CardHeader><CardTitle className="text-base">{L("Livraisons (check-in)", "Deliveries (check-in)")}</CardTitle></CardHeader><CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>{L("Produit", "Product")}</TableHead><TableHead>{L("Chargé", "Loaded")}</TableHead><TableHead>{L("Livré", "Delivered")}</TableHead><TableHead>{L("Écart", "Variance")}</TableHead></TableRow></TableHeader>
              <TableBody>{one.dels.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">—</TableCell></TableRow>}
                {one.dels.map((x) => { const p = variancePct(Number(x.load.qty_litres), Number(x.qty_delivered)); return <TableRow key={x.id}><TableCell>{day(x.delivered_at)}</TableCell><TableCell>{pName(x.load.product_id)}</TableCell><TableCell>{fmt(x.load.qty_litres)}</TableCell><TableCell>{fmt(x.qty_delivered)}</TableCell><TableCell className={Math.abs(p) > DELIVERY_TOLERANCE_PCT ? "text-destructive" : ""}>{p.toFixed(2)} %</TableCell></TableRow>; })}</TableBody></Table>
          </CardContent></Card>
        </div>
      )}
      {one && <p className="text-xs text-muted-foreground">{sName(one.st.id)}</p>}
    </div>
  );
};
