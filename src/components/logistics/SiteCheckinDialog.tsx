import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Site { key: string; type: string; id: string; stop: number; loads: Row[]; delivered: boolean; planned: number; received: number }

/** Groups loading lines by destination site; a site is delivered once each of its compartments has a check-in. */
export const siteProgress = (loads: Row[], deliveries: Row[]) => {
  const byLoad = new Map(deliveries.map((x) => [x.load_id, Number(x.qty_delivered)]));
  const map = new Map<string, Site>();
  for (const l of loads) {
    const id = l.station_id ?? l.client_id; const key = `${l.destination_type}:${id}`;
    const s = map.get(key) ?? { key, type: l.destination_type, id, stop: Number(l.stop_order), loads: [], delivered: true, planned: 0, received: 0 };
    s.loads.push(l); s.planned += Number(l.qty_litres); s.stop = Math.min(s.stop, Number(l.stop_order));
    if (byLoad.has(l.id)) s.received += byLoad.get(l.id)!; else s.delivered = false;
    map.set(key, s);
  }
  const sites = [...map.values()].sort((a, b) => a.stop - b.stop);
  const done = sites.filter((s) => s.delivered).length;
  return { sites, done, total: sites.length, allDelivered: sites.length > 0 && done === sites.length, received: sites.reduce((t, s) => t + s.received, 0) };
};

interface Props {
  trip: Row | null; onClose: () => void; onSaved: () => void; canWrite: boolean;
  loads: Row[]; deliveries: Row[]; compartments: Row[]; products: Row[]; stations: Row[]; clients: Row[];
  L: (fr: string, en: string) => string;
}

export const SiteCheckinDialog = ({ trip, onClose, onSaved, canWrite, loads, deliveries, compartments, products, stations, clients, L }: Props) => {
  const tripLoads = useMemo(() => loads.filter((l) => l.trip_id === trip?.id), [loads, trip?.id]);
  const tripDel = useMemo(() => deliveries.filter((x) => x.trip_id === trip?.id), [deliveries, trip?.id]);
  const p = siteProgress(tripLoads, tripDel);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setQty(Object.fromEntries(tripLoads.map((l) => [l.id, String(l.qty_litres)]))); }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nm = (list: Row[], id: string) => list.find((x) => x.id === id)?.name ?? "—";
  const comp = (id: string) => compartments.find((c) => c.id === id)?.position;
  const fmt = (n: number) => n.toLocaleString("fr-FR");
  const canCheck = canWrite && ["arrived", "unloading"].includes(trip?.status);

  const confirm = async (s: Site) => {
    const lines = s.loads.map((l) => ({ load_id: l.id, qty_delivered: qty[l.id] }));
    if (lines.some((l) => l.qty_delivered === "" || Number(l.qty_delivered) < 0)) return toast.error(L("Quantité manquante", "Missing quantity"));
    const over = s.loads.find((l) => Number(qty[l.id]) > Number(l.qty_litres));
    if (over) return toast.error(L("Quantité supérieure à la capacité du compartiment", "Quantity above compartment capacity"));
    setBusy(s.key);
    const { error } = await db.rpc("logistics_confirm_site", { _trip: trip!.id, _lines: lines });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(L("Site validé", "Site confirmed"));
    onSaved();
  };

  return (
    <Dialog open={!!trip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{L("Check-in des sites", "Site check-in")} — {trip?.reference}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>{L("Sites livrés", "Sites delivered")} : <b>{p.done}</b> / {p.total}</span>
              <Badge variant={p.allDelivered ? "outline" : "secondary"}>{p.allDelivered ? L("Tous les sites livrés", "All sites delivered") : L("Livraison en cours", "Delivery in progress")}</Badge>
            </div>
            <Progress value={p.total ? (p.done / p.total) * 100 : 0} />
          </div>
          {!p.total && <p className="text-sm text-destructive">{L("Aucun plan de chargement pour ce transport.", "No loading plan for this trip.")}</p>}
          {p.sites.map((s, i) => (
            <div key={s.key} className="border border-border/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  {s.delivered ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  {L("Site", "Site")} {i + 1} — {s.type === "station" ? nm(stations, s.id) : nm(clients, s.id)}
                  <span className="text-xs text-muted-foreground">({s.type === "station" ? L("station", "station") : L("client", "customer")}, {L("arrêt", "stop")} {s.stop})</span>
                </div>
                <Badge variant={s.delivered ? "outline" : "secondary"}>{s.delivered ? `${L("Livré", "Delivered")} · ${fmt(s.received)} / ${fmt(s.planned)} L` : `${fmt(s.planned)} L ${L("prévus", "planned")}`}</Badge>
              </div>
              {s.loads.map((l) => {
                const dl = tripDel.find((x) => x.load_id === l.id);
                return (
                  <div key={l.id} className="grid grid-cols-4 gap-2 items-center text-sm">
                    <span>{l.compartment_id ? `${L("Compartiment", "Compartment")} ${comp(l.compartment_id) ?? ""}` : L("Lot", "Lot")}</span>
                    <span>{nm(products, l.product_id)}</span>
                    <span className="text-muted-foreground">{L("Capacité", "Capacity")} {fmt(Number(l.qty_litres))} L</span>
                    {dl ? <span>{fmt(Number(dl.qty_delivered))} L</span>
                      : <Input type="number" min={0} max={l.qty_litres} disabled={!canCheck} value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} />}
                  </div>
                );
              })}
              {!s.delivered && canCheck && <Button size="sm" disabled={busy === s.key} onClick={() => confirm(s)}>{busy === s.key && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{L("Valider la livraison de ce site", "Confirm delivery for this site")}</Button>}
            </div>
          ))}
          {!canCheck && trip && !["delivered"].includes(trip.status) && <p className="text-xs text-muted-foreground">{L("Le check-in s'ouvre à l'arrivée du camion.", "Check-in opens when the truck arrives.")}</p>}
          <p className="text-xs text-muted-foreground">{L("Chaque site est validé compartiment par compartiment, sans dépasser la capacité chargée. « Livraison terminée » n'est possible qu'une fois tous les sites livrés ; le total livré est recalculé automatiquement.", "Each site is confirmed compartment by compartment, never above loaded capacity. \"Delivered\" is only possible once every site is delivered; the delivered total is recomputed automatically.")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
