import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Line = { compartment_id?: string; position?: number; capacity?: number; product_id: string; qty_litres: string; destination_type: "station" | "client"; station_id: string; client_id: string; stop_order: string };

/** Total planned volume must equal vehicle capacity (sum of compartments, else vehicle capacity). */
export const planTotals = (lines: { qty_litres: string | number }[], capacity: number) => {
  const total = lines.reduce((s, l) => s + (Number(l.qty_litres) || 0), 0);
  return { total, capacity, full: capacity > 0 && total === capacity };
};

interface Props {
  trip: Row | null; onClose: () => void; onSaved: () => void;
  vehicles: Row[]; compartments: Row[]; products: Row[]; stations: Row[]; clients: Row[]; loads: Row[];
  L: (fr: string, en: string) => string;
}

export const LoadPlanDialog = ({ trip, onClose, onSaved, vehicles, compartments, products, stations, clients, loads, L }: Props) => {
  const vehId = trip ? trip.tanker_id ?? trip.truck_id : null;
  const veh = vehicles.find((v) => v.id === vehId);
  const comps = useMemo(() => compartments.filter((c) => c.vehicle_id === vehId).sort((a, b) => a.position - b.position), [compartments, vehId]);
  const capacity = comps.length ? comps.reduce((s, c) => s + Number(c.capacity_litres), 0) : Number(veh?.capacity_litres ?? 0);

  const [mode, setMode] = useState<"mono" | "mixed">("mono");
  const [monoProduct, setMonoProduct] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!trip) return;
    const existing = loads.filter((l) => l.trip_id === trip.id);
    const blank = (extra: Partial<Line> = {}): Line => ({ product_id: "", qty_litres: "", destination_type: "station", station_id: "", client_id: "", stop_order: "1", ...extra });
    const fromRow = (l: Row): Partial<Line> => ({ product_id: l.product_id, qty_litres: String(l.qty_litres), destination_type: l.destination_type, station_id: l.station_id ?? "", client_id: l.client_id ?? "", stop_order: String(l.stop_order) });
    if (comps.length) {
      setLines(comps.map((c) => { const e = existing.find((x) => x.compartment_id === c.id); return blank({ compartment_id: c.id, position: c.position, capacity: Number(c.capacity_litres), qty_litres: String(c.capacity_litres), ...(e ? fromRow(e) : {}) }); }));
    } else {
      setLines(existing.length ? existing.map((e) => blank(fromRow(e))) : [blank({ qty_litres: capacity ? String(capacity) : "" })]);
    }
    setMode(trip.load_mode ?? "mono");
    setMonoProduct(existing[0]?.product_id ?? "");
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const { total, full } = planTotals(lines, capacity);
  const pct = capacity ? Math.min(100, (total / capacity) * 100) : 0;

  const save = async () => {
    const payload = lines.map((l) => ({ ...l, product_id: mode === "mono" ? monoProduct : l.product_id }));
    if (payload.some((l) => !l.product_id)) return toast.error(L("Produit manquant", "Missing product"));
    if (payload.some((l) => (l.destination_type === "station" ? !l.station_id : !l.client_id))) return toast.error(L("Destination manquante", "Missing destination"));
    if (!full) return toast.error(L("Le camion doit être chargé à son volume total", "The truck must be loaded to full capacity"));
    setBusy(true);
    const { error } = await db.rpc("logistics_set_loads", { _trip: trip!.id, _mode: mode, _lines: payload });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(L("Plan de chargement enregistré", "Loading plan saved"));
    onSaved(); onClose();
  };

  const destinations = new Set(lines.map((l) => (l.destination_type === "station" ? l.station_id : l.client_id)).filter(Boolean)).size;

  return (
    <Dialog open={!!trip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{L("Plan de chargement", "Loading plan")} {trip?.reference} — {veh?.registration ?? "—"}</DialogTitle></DialogHeader>
        {!vehId || capacity <= 0 ? (
          <p className="text-sm text-destructive">{L("Affectez un camion / une citerne avec capacité ou compartiments configurés.", "Assign a truck / tanker with capacity or compartments configured.")}</p>
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="grid gap-1"><Label>{L("Type de chargement", "Load type")}</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "mono" | "mixed")}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="mono">{L("Mono-produit", "Single product")}</SelectItem><SelectItem value="mixed">{L("Produit mixte", "Mixed products")}</SelectItem></SelectContent></Select></div>
              {mode === "mono" && <div className="grid gap-1"><Label>{L("Produit (tout le camion)", "Product (whole truck)")}</Label>
                <Select value={monoProduct} onValueChange={setMonoProduct}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>}
              <div className="text-sm">{L("Destinations", "Destinations")} : <b>{destinations}</b></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{L("Volume planifié", "Planned volume")} : <b>{total.toLocaleString("fr-FR")}</b> / {capacity.toLocaleString("fr-FR")} L</span>
                <Badge variant={full ? "outline" : "destructive"}>{full ? L("Plein — 100 %", "Full — 100 %") : `${pct.toFixed(1)} %`}</Badge>
              </div>
              <Progress value={pct} />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid md:grid-cols-6 gap-2 items-end border border-border/50 rounded-md p-2">
                <div className="text-sm font-medium">{l.compartment_id ? `${L("Compartiment", "Compartment")} ${l.position}` : `${L("Ligne", "Line")} ${i + 1}`}</div>
                <div className="grid gap-1"><Label className="text-xs">{L("Volume (L)", "Volume (L)")}</Label>
                  <Input type="number" value={l.qty_litres} disabled={!!l.compartment_id} onChange={(e) => upd(i, { qty_litres: e.target.value })} /></div>
                <div className="grid gap-1"><Label className="text-xs">{L("Produit", "Product")}</Label>
                  <Select value={mode === "mono" ? monoProduct : l.product_id} disabled={mode === "mono"} onValueChange={(v) => upd(i, { product_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-1"><Label className="text-xs">{L("Destination", "Destination")}</Label>
                  <Select value={l.destination_type} onValueChange={(v) => upd(i, { destination_type: v as "station" | "client" })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="station">{L("Station", "Station")}</SelectItem><SelectItem value="client">{L("Client", "Customer")}</SelectItem></SelectContent></Select></div>
                <div className="grid gap-1"><Label className="text-xs">{l.destination_type === "station" ? L("Station", "Station") : L("Client", "Customer")}</Label>
                  {l.destination_type === "station"
                    ? <Select value={l.station_id} onValueChange={(v) => upd(i, { station_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
                    : <Select value={l.client_id} onValueChange={(v) => upd(i, { client_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{clients.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>}
                </div>
                <div className="flex gap-1 items-end">
                  <div className="grid gap-1 flex-1"><Label className="text-xs">{L("Ordre d'arrêt", "Stop #")}</Label><Input type="number" min={1} value={l.stop_order} onChange={(e) => upd(i, { stop_order: e.target.value })} /></div>
                  {!l.compartment_id && lines.length > 1 && <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            ))}
            {!comps.length && <Button size="sm" variant="outline" onClick={() => setLines([...lines, { product_id: "", qty_litres: String(Math.max(0, capacity - total)), destination_type: "station", station_id: "", client_id: "", stop_order: String(lines.length + 1) }])}><Plus className="h-4 w-4 mr-1" />{L("Ajouter une destination", "Add destination")}</Button>}
            <p className="text-xs text-muted-foreground">{comps.length
              ? L("Chaque compartiment est chargé à sa capacité, avec un produit et une destination.", "Each compartment is loaded to capacity with one product and one destination.")
              : L("Sans compartiments déclarés, répartissez la capacité totale entre destinations.", "Without declared compartments, split total capacity across destinations.")}</p>
          </div>
        )}
        <DialogFooter><Button onClick={save} disabled={busy || !full}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{L("Enregistrer le plan", "Save plan")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
