import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { allocateBe, worstStatus, type AllocStatus } from "@/lib/liftingAllocation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

interface Props { d: Record<string, Row[]>; L: (fr: string, en: string) => string }

export const LiftingAllocationTab = ({ d, L }: Props) => {
  const { scopeQuery } = useScope();
  const [lines, setLines] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  useEffect(() => {
    scopeQuery(db.from("depot_lifting_lines").select("lifting_id,product_id,qty_litres")).then((r: Row) => setLines(r.data ?? []));
    scopeQuery(db.from("logistics_delivery_notes").select("id,trip_id,number,station_id,client_id")).then((r: Row) => setNotes(r.data ?? []));
  }, [scopeQuery]);

  const LABEL: Record<AllocStatus, [string, string, "outline" | "destructive" | "secondary"]> = {
    conform: [L("Conforme", "Matched"), "", "outline"],
    unallocated: [L("Litres non affectés", "Unallocated litres"), "", "destructive"],
    surplus: [L("Surplus attribué", "Over-allocated"), "", "destructive"],
    short_delivered: [L("Livré < BL", "Delivered < DN"), "", "secondary"],
  };
  const prod = (id: string) => (d.products ?? []).find((p) => p.id === id)?.name ?? "—";
  const dest = (l: Row) => (l.station_id ? (d.stations ?? []).find((s) => s.id === l.station_id)?.name : (d.clients ?? []).find((c) => c.id === l.client_id)?.name) ?? "—";

  const rows = useMemo(() => (d.liftings ?? []).filter((b) => b.status !== "cancelled").map((b) => {
    const trip = (d.trips ?? []).find((t) => t.id === b.trip_id);
    const loads = (d.loads ?? []).filter((l) => l.trip_id === b.trip_id);
    const dels = (d.deliveries ?? []).filter((x) => x.trip_id === b.trip_id);
    const alloc = allocateBe(lines.filter((l) => l.lifting_id === b.id) as never, loads as never, dels as never, trip?.status === "delivered");
    const sites = [...new Set(loads.map((l) => l.station_id ?? l.client_id))].map((k) => {
      const sl = loads.filter((l) => (l.station_id ?? l.client_id) === k);
      const ids = new Set(sl.map((l) => l.id));
      return { key: k, name: dest(sl[0]), bl: notes.find((n) => n.trip_id === b.trip_id && (n.station_id ?? n.client_id) === k)?.number,
        litres: sl.reduce((s, l) => s + Number(l.qty_litres), 0), delivered: dels.filter((x) => ids.has(x.load_id)).reduce((s, x) => s + Number(x.qty_delivered), 0) };
    });
    return { b, trip, alloc, sites, status: worstStatus(alloc) };
  }), [d, lines, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (s: AllocStatus) => rows.filter((r) => r.status === s).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(LABEL) as AllocStatus[]).map((s) => (
          <Card key={s} className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{LABEL[s][0]}</p><p className="text-2xl font-bold">{count(s)}</p></CardContent></Card>
        ))}
      </div>
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">{L("Répartition des bons d'enlèvement sur les bons de livraison", "Lifting orders split across delivery notes")}</CardTitle>
          <p className="text-xs text-muted-foreground">{L("Enlevé (BE) = somme des volumes affectés aux BL par destination. Lecture seule.", "Lifted (LO) = sum of volumes allocated to delivery notes. Read-only.")}</p></CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{L("Aucun bon d'enlèvement.", "No lifting order.")}</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>BE</TableHead><TableHead>{L("Transport", "Trip")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead>
                <TableHead className="text-right">{L("Enlevé (BE)", "Lifted")}</TableHead><TableHead className="text-right">{L("Affecté (BL)", "Allocated")}</TableHead>
                <TableHead className="text-right">{L("Écart", "Gap")}</TableHead><TableHead className="text-right">{L("Livré", "Delivered")}</TableHead>
                <TableHead>{L("Destinations / BL", "Destinations / DN")}</TableHead><TableHead>{L("État", "Status")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.flatMap((r) => r.alloc.map((a, i) => (
                  <TableRow key={r.b.id + a.productId}>
                    {i === 0 && <TableCell rowSpan={r.alloc.length} className="font-medium">{r.b.number}<div className="text-xs text-muted-foreground">{r.b.status === "signed" ? L("Signé", "Signed") : L("Établi", "Drafted")}</div></TableCell>}
                    {i === 0 && <TableCell rowSpan={r.alloc.length} className="text-xs">{r.trip?.reference ?? "—"}</TableCell>}
                    <TableCell>{prod(a.productId)}</TableCell>
                    <TableCell className="text-right">{fmt(a.lifted)}</TableCell>
                    <TableCell className="text-right">{fmt(a.allocated)}</TableCell>
                    <TableCell className="text-right">{fmt(a.allocated - a.lifted)}</TableCell>
                    <TableCell className="text-right">{fmt(a.delivered)}</TableCell>
                    {i === 0 && <TableCell rowSpan={r.alloc.length} className="text-xs space-y-1">{r.sites.length === 0 ? "—" : r.sites.map((s) => <div key={s.key}>{s.name} · {fmt(s.litres)} L · {s.bl ?? L("BL à générer", "DN pending")}</div>)}</TableCell>}
                    <TableCell><Badge variant={LABEL[a.status][2]}>{LABEL[a.status][0]}</Badge></TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
