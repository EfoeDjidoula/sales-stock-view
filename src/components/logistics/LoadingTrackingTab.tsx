import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Truck } from "lucide-react";
import { TankerTruckVisualizer } from "./TankerTruckVisualizer";
import { LOADING_STAGES, loadingStage, matchesFilter, type LoadingStage, type TrackingFilter } from "@/lib/loadingTracking";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: unknown) => (n == null || n === "" ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const fmtDt = (d?: string) => (d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "—");
const ALL = "__all";
const ORDER: LoadingStage[] = ["waiting", "loading", "loaded", "en_route", "partial", "delivered", "closed"];

interface Props { d: Record<string, Row[]>; L: (fr: string, en: string) => string; statusLabel: (s: string) => string;
  /** Next lifecycle step label for a trip (null = none) and its trigger; writes go through logistics_trip_action in LogisticsModule. */
  nextStep?: (t: Row) => string | null; onAdvance?: (t: Row) => void; onIncident?: (t: Row) => void }

export const LoadingTrackingTab = ({ d, L, statusLabel, nextStep, onAdvance, onIncident }: Props) => {
  const { scopeQuery } = useScope();
  const [f, setF] = useState<TrackingFilter>({});
  const [hist, setHist] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [visual, setVisual] = useState<Row | null>(null);
  const nm = (list: string, id?: string | null, key = "name") => (d[list] ?? []).find((x) => x.id === id)?.[key] ?? "—";

  const rows = useMemo(() => (d.trips ?? []).map((t) => {
    const loads = (d.loads ?? []).filter((x) => x.trip_id === t.id);
    const dels = (d.deliveries ?? []).filter((x) => x.trip_id === t.id);
    const be = (d.liftings ?? []).find((b) => b.trip_id === t.id);
    const dests = [...new Set(loads.map((x) => x.station_id ?? x.client_id).filter(Boolean))] as string[];
    const doneLoads = new Set(dels.map((x) => x.load_id));
    const sitesDone = dests.filter((s) => loads.filter((l) => (l.station_id ?? l.client_id) === s).every((l) => doneLoads.has(l.id))).length;
    const openVariance = (d.alerts ?? []).some((a) => a.kind === "quantity_variance" && a.trip_id === t.id);
    const stage = loadingStage({ status: t.status, qtyLoaded: t.qty_loaded, qtyDelivered: t.qty_delivered, sitesTotal: dests.length, sitesDone, openVariance });
    return { t, be, loads, dests, sitesDone, stage, date: t.planned_departure ?? t.created_at, depotId: be?.depot_id ?? null,
      vehicleIds: [t.truck_id, t.tanker_id].filter(Boolean), driverId: t.driver_id, productIds: [...new Set(loads.map((l) => l.product_id))], destIds: dests };
  }), [d]);
  const shown = rows.filter((r) => matchesFilter(r, f));
  const counts = ORDER.map((s) => [s, rows.filter((r) => r.stage === s && matchesFilter(r, { ...f, stage: undefined })).length] as const);

  useEffect(() => {
    if (!hist) return;
    scopeQuery(db.from("logistics_trip_events").select("*")).eq("trip_id", hist.t.id).order("created_at").then((r: Row) => setEvents(r.data ?? []));
  }, [hist, scopeQuery]);

  const sel = (k: keyof TrackingFilter, label: string, opts: { v: string; l: string }[]) => (
    <div className="space-y-1"><Label className="text-xs">{label}</Label>
      <Select value={(f[k] as string) ?? ALL} onValueChange={(v) => setF({ ...f, [k]: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{L("Tous", "All")}</SelectItem>{opts.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
      </Select></div>
  );
  const depotIds = [...new Set((d.liftings ?? []).map((b) => b.depot_id).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
        {counts.map(([s, n]) => (
          <button key={s} onClick={() => setF({ ...f, stage: f.stage === s ? undefined : s })}
            className={`glass-card rounded-lg p-3 text-left border ${f.stage === s ? "border-primary" : "border-transparent"}`}>
            <div className="text-xs text-muted-foreground">{L(...LOADING_STAGES[s])}</div><div className="text-xl font-bold">{n}</div>
          </button>
        ))}
      </div>
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">{L("Filtres", "Filters")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <div className="space-y-1"><Label className="text-xs">{L("Du", "From")}</Label><Input type="date" className="h-9" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} /></div>
          <div className="space-y-1"><Label className="text-xs">{L("Au", "To")}</Label><Input type="date" className="h-9" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} /></div>
          {sel("depotId", L("Dépôt", "Depot"), depotIds.map((id) => ({ v: id, l: nm("depots", id) })))}
          {sel("vehicleId", L("Camion", "Truck"), (d.vehicles ?? []).map((v) => ({ v: v.id, l: v.registration })))}
          {sel("driverId", L("Chauffeur", "Driver"), (d.drivers ?? []).map((v) => ({ v: v.id, l: v.full_name })))}
          {sel("productId", L("Produit", "Product"), (d.products ?? []).map((v) => ({ v: v.id, l: v.name })))}
          {sel("destId", L("Station / client", "Station / client"), [...(d.stations ?? []), ...(d.clients ?? [])].map((v) => ({ v: v.id, l: v.name })))}
          <Button variant="outline" size="sm" onClick={() => setF({})}>{L("Réinitialiser", "Reset")}</Button>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">{L("Suivi des chargements", "Loading tracking")} ({shown.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("Date", "Date")}</TableHead><TableHead>BE</TableHead><TableHead>{L("Transport", "Trip")}</TableHead><TableHead>{L("Dépôt", "Depot")}</TableHead>
              <TableHead>{L("Camion", "Truck")}</TableHead><TableHead>{L("Chauffeur", "Driver")}</TableHead><TableHead>{L("Produits", "Products")}</TableHead>
              <TableHead>{L("Destinations", "Destinations")}</TableHead><TableHead className="text-right">{L("Chargé", "Loaded")}</TableHead><TableHead className="text-right">{L("Livré", "Delivered")}</TableHead>
              <TableHead>{L("Statut", "Status")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {shown.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">{L("Aucun chargement", "No loading")}</TableCell></TableRow>}
              {shown.map((r) => (
                <TableRow key={r.t.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDt(r.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.be?.number ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.t.reference}</TableCell>
                  <TableCell className="text-xs">{r.depotId ? nm("depots", r.depotId) : "—"}</TableCell>
                  <TableCell className="text-xs">{nm("vehicles", r.t.truck_id, "registration")}{r.t.tanker_id && ` + ${nm("vehicles", r.t.tanker_id, "registration")}`}</TableCell>
                  <TableCell className="text-xs">{nm("drivers", r.t.driver_id, "full_name")}</TableCell>
                  <TableCell className="text-xs">{r.productIds.map((p) => nm("products", p)).join(" + ") || "—"}</TableCell>
                  <TableCell className="text-xs">{r.dests.map((s) => (d.stations ?? []).find((x) => x.id === s)?.name ?? nm("clients", s)).join(", ") || "—"}{r.dests.length > 0 && ` (${r.sitesDone}/${r.dests.length})`}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.t.qty_loaded)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.t.qty_delivered)}</TableCell>
                  <TableCell><Badge variant={r.stage === "incident" || r.stage === "cancelled" ? "destructive" : r.stage === "closed" ? "outline" : "default"}>{L(...LOADING_STAGES[r.stage])}</Badge></TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button size="sm" variant="ghost" title={L("Voir le camion et ses compartiments", "View truck and compartments")} onClick={() => setVisual(r)}><Truck className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title={L("Historique", "History")} onClick={() => { setEvents([]); setHist(r); }}><Eye className="h-4 w-4" /></Button>
                    {onAdvance && nextStep?.(r.t) && <Button size="sm" onClick={() => onAdvance(r.t)}>{nextStep(r.t)}</Button>}
                    {onIncident && !["delivered", "incident", "cancelled"].includes(r.t.status) && <Button size="sm" variant="destructive" title={L("Déclarer un incident", "Report incident")} onClick={() => onIncident(r.t)}>!</Button>}
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!visual} onOpenChange={(o) => !o && setVisual(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] min-w-0 max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
          <DialogHeader><DialogTitle>{L("Chargement du camion", "Truck load")} · {visual?.t.reference}</DialogTitle></DialogHeader>
          {visual && <div className="space-y-3">
            <Badge variant={visual.stage === "closed" ? "outline" : "default"}>{L(...LOADING_STAGES[visual.stage as LoadingStage])}</Badge>
            <TankerTruckVisualizer
              registration={nm("vehicles", visual.t.truck_id, "registration")}
              trailerRegistration={visual.t.tanker_id ? nm("vehicles", visual.t.tanker_id, "registration") : undefined}
              driverName={nm("drivers", visual.t.driver_id, "full_name")}
              compartments={visual.loads.slice().sort((a: Row, b: Row) => {
                const pa = (d.compartments ?? []).find((c) => c.id === a.compartment_id)?.position ?? 0;
                const pb = (d.compartments ?? []).find((c) => c.id === b.compartment_id)?.position ?? 0;
                return pa - pb;
              }).map((load: Row, index: number) => {
                const comp = (d.compartments ?? []).find((c) => c.id === load.compartment_id);
                return {
                  id: load.compartment_id ?? load.id,
                  position: comp?.position ?? index + 1,
                  capacity: Number(comp?.capacity_litres ?? load.qty_litres),
                  qty: load.qty_litres,
                  productName: nm("products", load.product_id),
                  destinationName: load.destination_type === "station" ? nm("stations", load.station_id) : nm("clients", load.client_id),
                  stopOrder: load.stop_order,
                };
              })}
              L={L}
            />
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{L("Historique des transitions", "Transition history")} · {hist?.t.reference}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{L("Date", "Date")}</TableHead><TableHead>{L("Action", "Action")}</TableHead><TableHead>{L("Transition", "Transition")}</TableHead><TableHead>{L("Motif", "Reason")}</TableHead><TableHead>{L("Par", "By")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">{L("Aucun événement", "No event")}</TableCell></TableRow>}
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDt(e.created_at)}</TableCell>
                    <TableCell className="text-xs">{e.action}</TableCell>
                    <TableCell className="text-xs">{e.from_status ? statusLabel(e.from_status) : "—"} → {e.to_status ? statusLabel(e.to_status) : "—"}</TableCell>
                    <TableCell className="text-xs max-w-xs">{e.reason ?? ""}</TableCell>
                    <TableCell className="text-xs">{e.author_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
