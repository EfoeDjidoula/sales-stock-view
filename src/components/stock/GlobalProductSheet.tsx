import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays } from "@/lib/reports";
import { isAuthorized } from "@/lib/depotSupply";
import { buildGlobalSheet, splitByStation, type GsLifting, type GsPurchase } from "@/lib/globalStockSheet";
import { GLOBAL_HEADERS, exportGlobalPdf, exportGlobalXlsx, globalSheetRows } from "@/lib/ecapExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v: string | number) => (typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : v);

/** Fiche globale par produit : stock dépôt début de journée, achats BC, enlèvements BE ventilés par station, stock fin de journée. */
export default function GlobalProductSheet({ refs }: { refs: Record<string, Row[]> }) {
  const { scopeQuery, tenantId } = useScope();
  const brand = useBranding();
  const [product, setProduct] = useState("");
  const [depot, setDepot] = useState("all");
  const [from, setFrom] = useState(() => addDays(today(), -1));
  const [to, setTo] = useState(() => addDays(today(), -1));
  const [raw, setRaw] = useState<{ pf: Row[]; be: Row[]; loads: Row[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { if (!product && refs.products[0]) setProduct(refs.products[0].id); }, [refs.products, product]);
  useEffect(() => {
    if (!tenantId) return;
    setRaw(null); setErr("");
    Promise.all([
      scopeQuery(db.from("depot_proformas").select("id,number,depot_id,depots(name),depot_proforma_lines(product_id,qty_litres),depot_purchase_orders(number,issue_date,payment_status)")).lte("proforma_date", to),
      scopeQuery(db.from("depot_lifting_orders").select("id,number,depot_id,trip_id,planned_date,created_at,status,logistics_vehicles!depot_lifting_orders_vehicle_id_fkey(registration),logistics_drivers(full_name),depot_lifting_lines(product_id,qty_litres)")).neq("status", "cancelled"),
    ]).then(async ([pf, be]: Row[]) => {
      if (pf.error || be.error) { setErr((pf.error || be.error).message); return; }
      const trips = [...new Set((be.data ?? []).map((x: Row) => x.trip_id).filter(Boolean))];
      const loads = trips.length ? await db.from("logistics_trip_loads").select("trip_id,product_id,qty_litres,stations(name)").in("trip_id", trips) : { data: [] };
      if (loads.error) { setErr(loads.error.message); return; }
      setRaw({ pf: pf.data ?? [], be: be.data ?? [], loads: loads.data ?? [] });
    });
  }, [scopeQuery, tenantId, to]);

  const days = useMemo(() => {
    if (!raw || !product || from > to) return [];
    const okDepot = (id: string) => depot === "all" || id === depot;
    const purchases: GsPurchase[] = raw.pf.filter((p) => okDepot(p.depot_id)).flatMap((p) => {
      const po = Array.isArray(p.depot_purchase_orders) ? p.depot_purchase_orders[0] : p.depot_purchase_orders;
      if (!po || !isAuthorized(po.payment_status)) return [];
      const qty = (p.depot_proforma_lines ?? []).filter((l: Row) => l.product_id === product).reduce((s: number, l: Row) => s + Number(l.qty_litres || 0), 0);
      return qty ? [{ date: po.issue_date, number: po.number, proforma: p.number, depot: p.depots?.name ?? "", qty }] : [];
    });
    const liftings: GsLifting[] = raw.be.filter((b) => okDepot(b.depot_id)).flatMap((b) => {
      const qty = (b.depot_lifting_lines ?? []).filter((l: Row) => l.product_id === product).reduce((s: number, l: Row) => s + Number(l.qty_litres || 0), 0);
      if (!qty) return [];
      const loads = raw.loads.filter((l) => l.trip_id === b.trip_id && l.product_id === product).map((l) => ({ name: l.stations?.name ?? "Client", qty: Number(l.qty_litres || 0) }));
      return [{ date: b.planned_date ?? String(b.created_at).slice(0, 10), number: b.number, truck: b.logistics_vehicles?.registration ?? "", driver: b.logistics_drivers?.full_name ?? "", qty, stations: splitByStation(qty, loads) }];
    });
    return buildGlobalSheet(purchases, liftings, from, to);
  }, [raw, product, depot, from, to]);
  const pName = refs.products.find((p) => p.id === product)?.name ?? "";
  const rows = globalSheetRows(days);
  const stations = days.reduce<Record<string, number>>((a, d) => { Object.entries(d.byStation).forEach(([k, v]) => { a[k] = (a[k] ?? 0) + v; }); return a; }, {});
  const valid = from <= to && to <= today() && (to > from ? (new Date(to).getTime() - new Date(from).getTime()) / 864e5 <= 62 : true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>Produit</Label>
          <Select value={product} onValueChange={setProduct}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{refs.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Dépôt</Label>
          <Select value={depot} onValueChange={setDepot}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les dépôts</SelectItem>{refs.depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Date de début</Label><Input type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>Date de fin</Label><Input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="secondary" onClick={() => { setFrom(addDays(today(), -1)); setTo(addDays(today(), -1)); }}>Veille (N-1)</Button>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" className="gap-2" disabled={!days.length || !valid} onClick={() => void exportGlobalXlsx(days, pName, from, to, brand.legalName)}><Download className="w-4 h-4" />Excel</Button>
          <Button variant="outline" className="gap-2" disabled={!days.length || !valid} onClick={() => exportGlobalPdf(days, pName, from, to)}><FileText className="w-4 h-4" />PDF</Button>
        </div>
      </div>
      {!valid ? <p className="text-sm text-muted-foreground">Choisissez une période valide (62 jours max, pas de date future).</p>
        : err ? <p className="text-sm text-destructive">{err}</p>
        : !raw ? <Skeleton className="h-64 w-full" />
        : (<>
          {Object.keys(stations).length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">{Object.entries(stations).map(([k, v]) => <span key={k} className="rounded-md border border-border bg-secondary px-2 py-1">{k} : <b>{fmt(v)} L</b></span>)}</div>
          )}
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader><TableRow>{GLOBAL_HEADERS.map((h, i) => <TableHead key={h} className={i >= 4 ? "text-right whitespace-nowrap" : "whitespace-nowrap"}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{rows.map((r, i) => (
                <TableRow key={i} className={r.bold ? "bg-secondary/60 font-semibold" : ""}>
                  {r.cells.map((c, j) => <TableCell key={j} className={`${j >= 4 ? "text-right tabular-nums" : ""} ${j === 1 && String(c).startsWith("  →") ? "pl-8 text-muted-foreground" : ""}`}>{c === "" ? "" : fmt(c)}</TableCell>)}
                </TableRow>))}</TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Stock fin de journée = début de journée + achats (BC payés ou à crédit) − enlèvements (BE non annulés). Les ventes pistolet, le transit et les dépotages ne sont pas inclus.</p>
        </>)}
    </div>
  );
}
