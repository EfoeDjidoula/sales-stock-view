import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dischargeVariance, pendingDischarges, validGauges } from "@/lib/discharges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: unknown) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));

interface Props { d: Record<string, Row[]>; L: (fr: string, en: string) => string; canValidate: boolean; onChanged: () => void }

export const DischargesTab = ({ d, L, canValidate, onChanged }: Props) => {
  const { scopeQuery } = useScope();
  const { user } = useAuth();
  /** Stations affectées au compte (gérant) : null = aucune affectation → vue réseau complète. */
  const [mine, setMine] = useState<Set<string> | null>(null);
  useEffect(() => { if (!user) return; db.from("station_assignments").select("station_id").eq("user_id", user.id)
    .then(({ data }: { data: Row[] | null }) => setMine(data && data.length ? new Set(data.map((r) => r.station_id)) : null)); }, [user]);
  const allowed = (st?: string | null) => !mine || (!!st && mine.has(st));
  const [tanks, setTanks] = useState<Row[]>([]);
  const [done, setDone] = useState<Row[]>([]);
  const [cur, setCur] = useState<Row | null>(null);
  const [form, setForm] = useState({ tank: "", before: "", after: "", note: "", date: "" });
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Row[]>([]);
  const [pick, setPick] = useState<string>("all");

  const load = async () => {
    const [t, x, n] = await Promise.all([
      scopeQuery(db.from("tanks").select("id,name,station_id,product_id,capacity_liters")),
      scopeQuery(db.from("logistics_discharges").select("*").order("created_at", { ascending: false }).limit(500)),
      scopeQuery(db.from("logistics_delivery_notes").select("id,number,trip_id,station_id")),
    ]);
    setTanks(t.data ?? []); setDone(x.data ?? []); setNotes(n.data ?? []);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nm = (list: string, id?: string | null, key = "name") => (d[list] ?? []).find((r) => r.id === id)?.[key] ?? "—";
  const trip = (id: string) => (d.trips ?? []).find((t) => t.id === id);
  // Compartiments réceptionnables : livraison confirmée, ou camion arrivé / en déchargement (le dépotage confirme la livraison)
  const pending = useMemo(() => {
    const ok = new Set((d.deliveries ?? []).map((r) => r.load_id));
    (d.loads ?? []).forEach((l) => { if (["arrived", "unloading"].includes(trip(l.trip_id)?.status)) ok.add(l.id); });
    return (pendingDischarges((d.loads ?? []) as Row[] as never[], ok, new Set(done.map((r) => r.load_id))) as Row[]).filter((l) => allowed(l.station_id));
  }, [d, done, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const beOf = (tripId: string) => (d.liftings ?? []).find((b) => b.trip_id === tripId)?.number;
  const beDate = (tripId: string) => { const x = (d.liftings ?? []).find((b) => b.trip_id === tripId)?.planned_date; return x ? format(new Date(x + "T12:00:00"), "dd/MM/yyyy") : null; };
  const truckOf = (tripId: string) => { const t = trip(tripId); if (!t) return "—"; const a = nm("vehicles", t.truck_id, "registration"); return t.tanker_id ? `${a} + ${nm("vehicles", t.tanker_id, "registration")}` : a; };
  const blOf = (tripId: string, st?: string) => notes.find((n) => n.trip_id === tripId && n.station_id === st)?.number;
  const keyOf = (l: Row) => `${l.trip_id}|${l.station_id}`;
  const labelOf = (l: Row) => `${beOf(l.trip_id) ?? trip(l.trip_id)?.reference ?? "—"} · ${blOf(l.trip_id, l.station_id) ?? L("BL à venir", "BL pending")} · ${nm("stations", l.station_id)}`;
  const groups = useMemo(() => { const m = new Map<string, Row>(); pending.forEach((l) => { if (!m.has(keyOf(l))) m.set(keyOf(l), l); }); return [...m.entries()]; }, [pending, notes, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = pick === "all" ? pending : pending.filter((l) => keyOf(l) === pick);
  const delivered = new Set((d.deliveries ?? []).map((r) => r.load_id));
  const incoming = useMemo(() => {
    const m = new Map<string, Row>();
    (d.loads ?? []).forEach((l) => {
      const t = trip(l.trip_id);
      if (!l.station_id || !allowed(l.station_id) || delivered.has(l.id) || !t || !["loaded", "in_transit"].includes(t.status)) return;
      const k = keyOf(l); const g = m.get(k) ?? { ...l, t, lines: [] as Row[] }; g.lines.push(l); m.set(k, g);
    });
    return [...m.values()];
  }, [d, notes, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const tankName = (id: string) => tanks.find((t) => t.id === id)?.name ?? "—";
  const candTanks = cur ? tanks.filter((t) => allowed(t.station_id) && t.station_id === cur.station_id && (!t.product_id || t.product_id === cur.product_id)) : [];
  const tk = tanks.find((t) => t.id === form.tank);
  const b = Number(form.before), a = Number(form.after);
  const today = format(new Date(), "yyyy-MM-dd");
  const ok = !!form.date && form.date <= today && !!form.tank && form.before !== "" && form.after !== "" && validGauges(b, a, tk?.capacity_liters);
  const v = cur && ok ? dischargeVariance(Number(cur.qty_litres), b, a) : null;

  const submit = async () => {
    if (!cur) return;
    setBusy(true);
    const { error } = await db.rpc("logistics_discharge", { _load: cur.id, _tank: form.tank, _before: b, _after: a, _note: form.note || null, _date: form.date });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(L("Dépotage enregistré", "Discharge recorded"));
    setCur(null); await load(); onChanged();
  };

  return (
    <div className="space-y-4">
      {mine && <Badge variant="secondary">{L("Vos stations : ", "Your stations: ")}{[...mine].map((id) => nm("stations", id)).join(", ")}</Badge>}
      <Card>
        <CardHeader><CardTitle className="text-base">{L("Approvisionnements attendus (en route)", "Expected supplies (on the way)")} <Badge variant="outline" className="ml-2">{incoming.length}</Badge></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {incoming.length === 0 && <p className="text-sm text-muted-foreground">{L("Aucun camion en route vers vos stations", "No truck on the way to your stations")}</p>}
          {incoming.map((g) => (
            <div key={keyOf(g)} className="rounded-md border border-border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{nm("stations", g.station_id)}</b>
                <Badge>{L(...((({ loaded: ["Chargé", "Loaded"], in_transit: ["En route", "On the way"], arrived: ["Arrivé", "Arrived"], unloading: ["Déchargement", "Unloading"] }) as Record<string, [string, string]>)[g.t.status]))}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">BE {beOf(g.trip_id) ?? "—"}{beDate(g.trip_id) ? ` (${beDate(g.trip_id)})` : ""} · BL {blOf(g.trip_id, g.station_id) ?? "—"} · {nm("vehicles", g.t.truck_id, "registration")} · {nm("drivers", g.t.driver_id, "full_name")}{g.t.eta ? ` · ETA ${format(new Date(g.t.eta), "dd/MM HH:mm")}` : ""}</div>
              <div className="text-xs">{g.lines.map((l: Row) => `C${nm("compartments", l.compartment_id, "position")} ${nm("products", l.product_id)} ${fmt(l.qty_litres)} L`).join(" · ")}</div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{L("Dès que le camion arrive à la station, ses compartiments passent ci-dessous pour être réceptionnés en cuve.", "Once the truck arrives, compartments move below to be received into tanks.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2"><CardTitle className="text-base">{L("Compartiments à dépoter", "Compartments to discharge")} <Badge variant="outline" className="ml-2">{pending.length}</Badge></CardTitle>
          <div className="max-w-md"><Label>{L("Bon d'enlèvement / BL reçu", "Lifting order / delivery note")}</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{L("Tous les bons", "All")}</SelectItem>{groups.map(([k, l]) => <SelectItem key={k} value={k}>{labelOf(l)}</SelectItem>)}</SelectContent>
            </Select></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("BE / BL", "LO / DN")}</TableHead><TableHead>{L("Camion", "Truck")}</TableHead><TableHead>{L("Station", "Station")}</TableHead>
              <TableHead>{L("Compartiment", "Compartment")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead>
              <TableHead className="text-right">{L("Volume BL (L)", "BL volume (L)")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {pending.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{L("Aucun compartiment livré en attente de dépotage", "No delivered compartment awaiting discharge")}</TableCell></TableRow>}
              {shown.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{beOf(l.trip_id) ?? trip(l.trip_id)?.reference ?? "—"}<br />{blOf(l.trip_id, l.station_id) ?? "—"}{beDate(l.trip_id) && <div className="text-muted-foreground">{L("BE du ", "LO of ")}{beDate(l.trip_id)}</div>}</TableCell>
                  <TableCell className="text-xs">{truckOf(l.trip_id)}</TableCell>
                  <TableCell>{nm("stations", l.station_id)}</TableCell>
                  <TableCell>N° {nm("compartments", l.compartment_id, "position")}</TableCell>
                  <TableCell>{nm("products", l.product_id)}</TableCell>
                  <TableCell className="text-right">{fmt(l.qty_litres)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" disabled={!canValidate} onClick={() => { setCur(l); const c = tanks.filter((t) => t.station_id === l.station_id && (!t.product_id || t.product_id === l.product_id)); setForm({ tank: c.length === 1 ? c[0].id : "", before: "", after: "", note: "", date: format(new Date(Date.now() - 86400000), "yyyy-MM-dd") }); }}>{L("Réceptionner en cuve", "Receive into tank")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{L("Dépotages enregistrés (non modifiables)", "Recorded discharges (locked)")}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("Date", "Date")}</TableHead><TableHead>{L("Transport", "Trip")}</TableHead><TableHead>{L("Camion", "Truck")}</TableHead><TableHead>{L("Station", "Station")}</TableHead>
              <TableHead>{L("Cuve", "Tank")}</TableHead><TableHead className="text-right">BL</TableHead>
              <TableHead className="text-right">{L("Jauge avant", "Gauge before")}</TableHead><TableHead className="text-right">{L("Jauge après", "Gauge after")}</TableHead>
              <TableHead className="text-right">{L("Jaugé", "Measured")}</TableHead><TableHead className="text-right">{L("Écart", "Variance")}</TableHead>
              <TableHead>{L("Stock", "Stock")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {done.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">{L("Aucun dépotage", "No discharge")}</TableCell></TableRow>}
              {done.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.discharge_date ? format(new Date(r.discharge_date + "T12:00:00"), "dd/MM/yyyy") : format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                  <TableCell className="text-xs">{beOf(r.trip_id) ?? trip(r.trip_id)?.reference ?? "—"}{beDate(r.trip_id) && <div className="text-muted-foreground">{L("BE du ", "LO of ")}{beDate(r.trip_id)}</div>}</TableCell>
                  <TableCell className="text-xs">{truckOf(r.trip_id)}</TableCell>
                  <TableCell>{nm("stations", r.station_id)}</TableCell>
                  <TableCell>{tankName(r.tank_id)}</TableCell>
                  <TableCell className="text-right">{fmt(r.qty_bl)}</TableCell>
                  <TableCell className="text-right">{fmt(r.gauge_before)}</TableCell>
                  <TableCell className="text-right">{fmt(r.gauge_after)}</TableCell>
                  <TableCell className="text-right">{fmt(r.qty_measured)}</TableCell>
                  <TableCell className="text-right"><Badge variant={Number(r.variance) < 0 ? "destructive" : "outline"}>{Number(r.variance) > 0 ? "+" : ""}{fmt(r.variance)}</Badge></TableCell>
                  <TableCell>{r.stock_booked ? L("Crédité (BL)", "Booked (BL)") : L("Via réception appro", "Via supply reception")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!cur} onOpenChange={(o) => !o && setCur(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Dépotage du compartiment", "Compartment discharge")} — {cur && `${nm("stations", cur.station_id)} · ${fmt(cur.qty_litres)} L BL`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{L("Cuve de destination", "Destination tank")}</Label>
              <Select value={form.tank} onValueChange={(x) => setForm({ ...form, tank: x })}>
                <SelectTrigger><SelectValue placeholder={L("Choisir la cuve", "Choose tank")} /></SelectTrigger>
                <SelectContent>{candTanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({fmt(t.capacity_liters)} L)</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{L("Date du dépotage", "Discharge date")}</Label><Input type="date" max={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /><p className="text-xs text-muted-foreground">{L("Le stock de la cuve est crédité à cette date (même jour que les index).", "Tank stock is booked on this date (same day as the index).")}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{L("Jauge avant (L)", "Gauge before (L)")}</Label><Input inputMode="decimal" type="number" min={0} value={form.before} onChange={(e) => setForm({ ...form, before: e.target.value })} /></div>
              <div><Label>{L("Jauge après (L)", "Gauge after (L)")}</Label><Input inputMode="decimal" type="number" min={0} value={form.after} onChange={(e) => setForm({ ...form, after: e.target.value })} /></div>
            </div>
            {v && <p className="text-sm">{L("Jaugé", "Measured")} : <b>{fmt(v.measured)} L</b> · {L("Écart station", "Station variance")} : <b className={v.variance < 0 ? "text-destructive" : ""}>{v.variance > 0 ? "+" : ""}{fmt(v.variance)} L ({v.pct.toFixed(2)} %)</b></p>}
            {form.after !== "" && !ok && <p className="text-sm text-destructive">{L("Jauges invalides : après ≥ avant ≥ 0, sans dépasser la capacité.", "Invalid gauges: after ≥ before ≥ 0, within capacity.")}</p>}
            <div><Label>{L("Observation", "Note")}</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">{L("Le stock de la cuve est crédité au volume BL ; l'écart jaugé reste visible séparément. Enregistrement définitif.", "Tank stock is booked at BL volume; the measured variance stays separate. Final record.")}</p>
          </div>
          <DialogFooter><Button disabled={!ok || busy} onClick={submit}>{L("Enregistrer le dépotage", "Record discharge")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
