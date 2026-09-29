import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { toast } from "sonner";
import { Loader2, Plus, Eye, Check, X, Ban, FileDown } from "lucide-react";
import { jsPDF } from "jspdf";
import { fr } from "date-fns/locale";
import { getActiveBrand, hslToRgb, documentFooter } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STEPS = ["draft", "submitted", "approved", "ordered", "loaded", "in_transit", "delivered", "received"];
export const SUPPLY_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Besoin (brouillon)", variant: "secondary" },
  submitted: { label: "Demande soumise", variant: "default" },
  approved: { label: "Validée", variant: "default" },
  rejected: { label: "Rejetée", variant: "destructive" },
  ordered: { label: "Commandée", variant: "default" },
  loaded: { label: "Chargée au dépôt", variant: "default" },
  in_transit: { label: "En transport", variant: "default" },
  delivered: { label: "Livrée", variant: "default" },
  received: { label: "Réceptionnée / en stock", variant: "outline" },
  cancelled: { label: "Annulée", variant: "destructive" },
};
const ACTION_LABEL: Record<string, string> = {
  submit: "Soumission de la demande", approve: "Validation", reject: "Rejet", order: "Commande / ordre",
  load: "Chargement dépôt", depart: "Départ transport", deliver: "Livraison", receive: "Réception validée", cancel: "Annulation",
};
const fmt = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const fmtDt = (d?: string) => (d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "—");
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? String(e);
const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

export const SupplyWorkflowModule = () => {
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canWrite = isPlatformAdmin || can("supplies", "create") || can("supplies", "edit") || can("supplies", "validate");
  const canValidate = isPlatformAdmin || can("supplies", "validate");

  const [rows, setRows] = useState<Row[]>([]);
  const [stations, setStations] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [depots, setDepots] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [trucks, setTrucks] = useState<Row[]>([]);
  const [tanks, setTanks] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Row>({ station_id: "", product_id: "", tank_id: "", qty_requested: "", needed_date: "", need_reason: "", depot_id: "" });
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [r, st, pr, dp, sp, tr, tk] = await Promise.all([
      scopeQuery(db.from("supply_requests").select("*")).order("created_at", { ascending: false }).limit(300),
      scopeQuery(db.from("stations").select("id,name")).order("name"),
      scopeQuery(db.from("petroleum_products").select("id,code,name")),
      scopeQuery(db.from("depots").select("id,name")).order("name"),
      scopeQuery(db.from("suppliers").select("id,name")).order("name"),
      scopeQuery(db.from("trucks").select("id,registration,driver_name")),
      scopeQuery(db.from("tanks").select("id,name,station_id,product_id,capacity_liters")),
    ]);
    if (r.error) toast.error(errMsg(r.error));
    setRows(r.data ?? []); setStations(st.data ?? []); setProducts(pr.data ?? []); setDepots(dp.data ?? []);
    setSuppliers(sp.data ?? []); setTrucks(tr.data ?? []); setTanks(tk.data ?? []);
    setLoading(false);
  }, [tenantId, scopeQuery]);
  useEffect(() => { load(); }, [load, countryId]);

  const name = (list: Row[], id?: string, key = "name") => list.find((x) => x.id === id)?.[key] ?? "—";
  const filtered = useMemo(() => rows.filter((r) =>
    statusFilter === "all" ? true : statusFilter === "open" ? !["received", "cancelled"].includes(r.status) : r.status === statusFilter), [rows, statusFilter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const create = async () => {
    if (!form.station_id || !form.product_id || !(Number(form.qty_requested) > 0)) return toast.error("Station, produit et quantité sont obligatoires");
    const { error } = await db.from("supply_requests").insert({
      station_id: form.station_id, product_id: form.product_id, tank_id: form.tank_id || null,
      depot_id: form.depot_id || null, qty_requested: Number(form.qty_requested),
      needed_date: form.needed_date || null, need_reason: form.need_reason || null,
      tenant_id: tenantId, country_id: countryId,
    });
    if (error) return toast.error(errMsg(error));
    toast.success("Besoin enregistré (brouillon)");
    setCreating(false);
    setForm({ station_id: "", product_id: "", tank_id: "", qty_requested: "", needed_date: "", need_reason: "", depot_id: "" });
    load();
  };

  const stationTanks = tanks.filter((t) => t.station_id === form.station_id && (!form.product_id || t.product_id === form.product_id));

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const brand = getActiveBrand();
    const primary = hslToRgb(brand.primaryColor) as [number, number, number];
    const text: [number, number, number] = [31, 41, 55];
    const muted: [number, number, number] = [107, 114, 128];

    doc.setFillColor(...primary);
    doc.rect(0, 0, pageWidth, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(brand.legalName, pageWidth / 2, 11, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text("Approvisionnements & réceptions", pageWidth / 2, 19, { align: "center" });

    doc.setTextColor(...muted); doc.setFontSize(9);
    const filterLabel = statusFilter === "open" ? "En cours" : statusFilter === "all" ? "Tous" : SUPPLY_STATUS[statusFilter]?.label;
    doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy à HH:mm", { locale: fr })} — Filtre : ${filterLabel} — ${filtered.length} dossier(s)`, 14, 34);

    const cols = [14, 44, 74, 104, 134, 162, 190, 218, 246, 268];
    let y = 42;
    doc.setFillColor(249, 250, 251); doc.rect(14, y - 4, pageWidth - 28, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...muted);
    ["Réf.", "Station", "Produit", "Demandé", "Chargé", "Livré", "Réceptionné", "Écart livr.", "BL", "Statut"].forEach((h, i) => doc.text(h, cols[i], y + 1));
    y += 8;

    doc.setFont("helvetica", "normal");
    filtered.forEach((r, i) => {
      if (y > 190) { doc.addPage(); y = 20; }
      if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(14, y - 4, pageWidth - 28, 8, "F"); }
      doc.setFontSize(7.5); doc.setTextColor(...text);
      const vals = [r.reference, name(stations, r.station_id), name(products, r.product_id), fmt(r.qty_requested), fmt(r.qty_loaded), fmt(r.qty_delivered), fmt(r.qty_received), fmt(r.delivery_variance), r.bl_number ?? "—", SUPPLY_STATUS[r.status]?.label ?? r.status];
      vals.forEach((v, j) => doc.text(String(v).substring(0, 26), cols[j], y + 1));
      y += 8;
    });

    doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(documentFooter(brand), pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    doc.save(`Approvisionnements_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold">Approvisionnement & réception</h2>
          <p className="text-sm text-muted-foreground">Besoin → Demande → Validation → Commande → Chargement → Transport → Livraison → Réception → Mise en stock</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={exportPdf} disabled={filtered.length === 0}><FileDown className="w-4 h-4" />Export PDF</Button>
          {canWrite && <Button className="gap-2" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Nouveau besoin</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {STEPS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-lg border p-2 text-left transition-colors ${statusFilter === s ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
            <div className="text-[11px] text-muted-foreground leading-tight">{SUPPLY_STATUS[s].label}</div>
            <div className="text-lg font-semibold">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Dossiers d'approvisionnement</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">En cours</SelectItem>
              <SelectItem value="all">Tous</SelectItem>
              {Object.entries(SUPPLY_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun dossier</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Réf.</TableHead><TableHead>Station</TableHead><TableHead>Produit</TableHead>
                  <TableHead className="text-right">Demandé</TableHead><TableHead className="text-right">Chargé</TableHead>
                  <TableHead className="text-right">Livré</TableHead><TableHead className="text-right">Réceptionné</TableHead>
                  <TableHead className="text-right">Écart livr.</TableHead><TableHead>BL</TableHead><TableHead>Statut</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.reference}</TableCell>
                      <TableCell>{name(stations, r.station_id)}</TableCell>
                      <TableCell>{name(products, r.product_id)}</TableCell>
                      <TableCell className="text-right">{fmt(r.qty_requested)}</TableCell>
                      <TableCell className="text-right">{fmt(r.qty_loaded)}</TableCell>
                      <TableCell className="text-right">{fmt(r.qty_delivered)}</TableCell>
                      <TableCell className="text-right">{fmt(r.qty_received)}</TableCell>
                      <TableCell className={`text-right ${Number(r.delivery_variance) < 0 ? "text-destructive" : ""}`}>{fmt(r.delivery_variance)}</TableCell>
                      <TableCell>{r.bl_number ?? "—"}</TableCell>
                      <TableCell><Badge variant={SUPPLY_STATUS[r.status]?.variant}>{SUPPLY_STATUS[r.status]?.label}</Badge></TableCell>
                      <TableCell><Button size="icon" variant="ghost" aria-label="Ouvrir" onClick={() => setSelected(r)}><Eye className="w-4 h-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>Nouveau besoin d'approvisionnement</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>Station destination</Label>
              <Select value={form.station_id} onValueChange={(v) => setForm({ ...form, station_id: v, tank_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Produit</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v, tank_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Cuve (optionnel)</Label>
              <Select value={form.tank_id} onValueChange={(v) => setForm({ ...form, tank_id: v })}>
                <SelectTrigger><SelectValue placeholder="À préciser" /></SelectTrigger>
                <SelectContent>{stationTanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({fmt(t.capacity_liters)} L)</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label>Quantité demandée (L)</Label>
              <Input type="number" min={1} value={form.qty_requested} onChange={(e) => setForm({ ...form, qty_requested: e.target.value })} /></div>
            <div className="space-y-1"><Label>Date souhaitée</Label>
              <Input type="date" value={form.needed_date} onChange={(e) => setForm({ ...form, needed_date: e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label>Dépôt source (optionnel)</Label>
              <Select value={form.depot_id} onValueChange={(v) => setForm({ ...form, depot_id: v })}>
                <SelectTrigger><SelectValue placeholder="À préciser" /></SelectTrigger>
                <SelectContent>{depots.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="col-span-2 space-y-1"><Label>Motif du besoin</Label>
              <Textarea rows={2} value={form.need_reason} onChange={(e) => setForm({ ...form, need_reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)}>Annuler</Button><Button onClick={create}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <SupplyDetail
          request={selected} onClose={() => setSelected(null)} onChanged={async () => {
            await load();
            const { data } = await db.from("supply_requests").select("*").eq("id", selected.id).maybeSingle();
            if (data) setSelected(data);
          }}
          canWrite={canWrite} canValidate={canValidate}
          lookups={{ stations, products, depots, suppliers, trucks, tanks }} name={name}
        />
      )}
    </div>
  );
};

interface DetailProps {
  request: Row; onClose: () => void; onChanged: () => Promise<void>; canWrite: boolean; canValidate: boolean;
  lookups: Record<string, Row[]>; name: (l: Row[], id?: string, key?: string) => string;
}

const SupplyDetail = ({ request: r, onClose, onChanged, canWrite, canValidate, lookups, name }: DetailProps) => {
  const [events, setEvents] = useState<Row[]>([]);
  const [d, setD] = useState<Row>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "reject" | "cancel">(null);

  useEffect(() => {
    db.from("supply_request_events").select("*").eq("request_id", r.id).order("created_at").then(({ data }: { data: Row[] }) => setEvents(data ?? []));
    setD({
      qty_approved: r.qty_approved ?? r.qty_requested, order_number: r.order_number ?? "", depot_id: r.depot_id ?? "", supplier_id: r.supplier_id ?? "",
      qty_loaded: r.qty_approved ?? r.qty_requested, bl_number: r.bl_number ?? "", loaded_at: nowLocal(), truck_id: r.truck_id ?? "",
      vehicle_registration: r.vehicle_registration ?? "", driver_name: r.driver_name ?? "", seals: r.seals ?? "",
      departed_at: nowLocal(), qty_delivered: r.qty_loaded ?? "", delivered_at: nowLocal(), seals_intact: true,
      tank_id: r.tank_id ?? "", gauge_before: "", gauge_after: "", received_at: nowLocal(), observations: "",
    });
  }, [r]);

  const run = async (action: string, payload: Row = {}, why?: string) => {
    setBusy(true);
    const clean = Object.fromEntries(Object.entries({ ...payload, observations: d.observations }).filter(([, v]) => v !== "" && v !== undefined && v !== null)
      .map(([k, v]) => [k, /_at$/.test(k) ? new Date(v as string).toISOString() : v]));
    const { error } = await db.rpc("supply_transition", { _id: r.id, _action: action, _reason: why ?? null, _data: clean });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(ACTION_LABEL[action]);
    setConfirmAction(null); setReason("");
    await onChanged();
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const received = Number(d.gauge_after) - Number(d.gauge_before);
  const hasGauges = d.gauge_before !== "" && d.gauge_after !== "";
  const liveVariance = hasGauges && r.qty_delivered != null ? received - Number(r.qty_delivered) : null;
  const stationTanks = lookups.tanks.filter((t) => t.station_id === r.station_id && t.product_id === r.product_id);
  const stepIdx = STEPS.indexOf(r.status);
  const field = (label: string, node: React.ReactNode, span = false) => <div className={`space-y-1 ${span ? "col-span-2" : ""}`}><Label>{label}</Label>{node}</div>;
  const pick = (k: string, list: Row[], labelKey = "name", onPick?: (x: Row) => void) => (
    <Select value={d[k] || ""} onValueChange={(v) => { const x = list.find((i) => i.id === v); setD({ ...d, [k]: v, ...(onPick && x ? onPick(x) : {}) }); }}>
      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
      <SelectContent>{list.map((i) => <SelectItem key={i.id} value={i.id}>{i[labelKey]}</SelectItem>)}</SelectContent>
    </Select>
  );

  let stepForm: React.ReactNode = null;
  if (canWrite) {
    if (["draft", "rejected"].includes(r.status)) {
      stepForm = <Button disabled={busy} onClick={() => run("submit")}>Soumettre la demande</Button>;
    } else if (r.status === "submitted" && canValidate) {
      stepForm = <div className="grid grid-cols-2 gap-3 items-end">
        {field("Quantité validée (L)", <Input type="number" value={d.qty_approved} onChange={set("qty_approved")} />)}
        <div className="flex gap-2"><Button disabled={busy} onClick={() => run("approve", { qty_approved: Number(d.qty_approved) })}><Check className="w-4 h-4 mr-1" />Valider</Button>
          <Button variant="destructive" disabled={busy} onClick={() => setConfirmAction("reject")}><X className="w-4 h-4 mr-1" />Rejeter</Button></div>
      </div>;
    } else if (r.status === "approved") {
      stepForm = <div className="grid grid-cols-2 gap-3">
        {field("N° commande / ordre", <Input value={d.order_number} onChange={set("order_number")} />)}
        {field("Fournisseur", pick("supplier_id", lookups.suppliers))}
        {field("Dépôt source", pick("depot_id", lookups.depots), true)}
        <Button className="col-span-2" disabled={busy} onClick={() => run("order", { order_number: d.order_number, supplier_id: d.supplier_id, depot_id: d.depot_id })}>Enregistrer la commande</Button>
      </div>;
    } else if (r.status === "ordered") {
      stepForm = <div className="grid grid-cols-2 gap-3">
        {field("Quantité chargée (L)", <Input type="number" value={d.qty_loaded} onChange={set("qty_loaded")} />)}
        {field("N° BL", <Input value={d.bl_number} onChange={set("bl_number")} />)}
        {field("Date/heure de chargement", <Input type="datetime-local" value={d.loaded_at} onChange={set("loaded_at")} />)}
        {field("Dépôt source", pick("depot_id", lookups.depots))}
        {field("Camion", pick("truck_id", lookups.trucks, "registration", (t) => ({ vehicle_registration: t.registration, driver_name: t.driver_name ?? d.driver_name })))}
        {field("Immatriculation", <Input value={d.vehicle_registration} onChange={set("vehicle_registration")} />)}
        {field("Chauffeur", <Input value={d.driver_name} onChange={set("driver_name")} />)}
        {field("Scellés (n°)", <Input value={d.seals} onChange={set("seals")} placeholder="Optionnel" />)}
        <Button className="col-span-2" disabled={busy} onClick={() => run("load", {
          qty_loaded: Number(d.qty_loaded), bl_number: d.bl_number, loaded_at: d.loaded_at, depot_id: d.depot_id, truck_id: d.truck_id,
          vehicle_registration: d.vehicle_registration, driver_name: d.driver_name, seals: d.seals })}>Enregistrer le chargement</Button>
      </div>;
    } else if (r.status === "loaded") {
      stepForm = <div className="grid grid-cols-2 gap-3 items-end">
        {field("Date/heure de départ", <Input type="datetime-local" value={d.departed_at} onChange={set("departed_at")} />)}
        <Button disabled={busy} onClick={() => run("depart", { departed_at: d.departed_at })}>Démarrer le transport</Button>
      </div>;
    } else if (r.status === "in_transit") {
      stepForm = <div className="grid grid-cols-2 gap-3">
        {field("Quantité livrée (L)", <Input type="number" value={d.qty_delivered} onChange={set("qty_delivered")} />)}
        {field("Date/heure d'arrivée", <Input type="datetime-local" value={d.delivered_at} onChange={set("delivered_at")} />)}
        {r.seals && <label className="col-span-2 flex items-center gap-2 text-sm"><Checkbox checked={!!d.seals_intact} onCheckedChange={(v) => setD({ ...d, seals_intact: !!v })} />Scellés intacts à l'arrivée ({r.seals})</label>}
        <Button className="col-span-2" disabled={busy} onClick={() => run("deliver", { qty_delivered: Number(d.qty_delivered), delivered_at: d.delivered_at, ...(r.seals ? { seals_intact: !!d.seals_intact } : {}) })}>Enregistrer la livraison</Button>
      </div>;
    } else if (r.status === "delivered") {
      stepForm = canValidate ? <div className="grid grid-cols-2 gap-3">
        {field("Cuve de réception", pick("tank_id", stationTanks), true)}
        {field("Jauge avant (L)", <Input type="number" value={d.gauge_before} onChange={set("gauge_before")} />)}
        {field("Jauge après (L)", <Input type="number" value={d.gauge_after} onChange={set("gauge_after")} />)}
        {field("Date/heure de réception", <Input type="datetime-local" value={d.received_at} onChange={set("received_at")} />, true)}
        <div className="col-span-2 rounded-lg border p-3 text-sm grid grid-cols-3 gap-2">
          <div><div className="text-muted-foreground">Livré (BL)</div><div className="font-semibold">{fmt(r.qty_delivered)} L</div></div>
          <div><div className="text-muted-foreground">Réceptionné (jauges)</div><div className="font-semibold">{hasGauges ? `${fmt(received)} L` : "—"}</div></div>
          <div><div className="text-muted-foreground">Écart de livraison</div>
            <div className={`font-semibold ${liveVariance !== null && liveVariance < 0 ? "text-destructive" : ""}`}>
              {liveVariance === null ? "—" : `${liveVariance > 0 ? "+" : ""}${fmt(liveVariance)} L (${((liveVariance / Number(r.qty_delivered)) * 100).toFixed(2)} %)`}</div></div>
        </div>
        <Button className="col-span-2" disabled={busy || !d.tank_id || !hasGauges} onClick={() => run("receive", {
          tank_id: d.tank_id, gauge_before: Number(d.gauge_before), gauge_after: Number(d.gauge_after), received_at: d.received_at })}>
          Valider la réception et mettre en stock</Button>
      </div> : <p className="text-sm text-muted-foreground">En attente de validation de la réception par un responsable.</p>;
    }
  }

  const info: [string, React.ReactNode][] = [
    ["Station", name(lookups.stations, r.station_id)], ["Produit", name(lookups.products, r.product_id)],
    ["Cuve", name(lookups.tanks, r.tank_id)], ["Dépôt source", name(lookups.depots, r.depot_id)],
    ["Fournisseur", name(lookups.suppliers, r.supplier_id)], ["N° commande", r.order_number ?? "—"],
    ["Qté demandée", `${fmt(r.qty_requested)} L`], ["Qté validée", `${fmt(r.qty_approved)} L`],
    ["Qté chargée", `${fmt(r.qty_loaded)} L`], ["Qté livrée", `${fmt(r.qty_delivered)} L`],
    ["Qté réceptionnée", `${fmt(r.qty_received)} L`], ["Écart transport (livré − chargé)", `${fmt(r.transport_variance)} L`],
    ["Écart livraison (reçu − livré)", `${fmt(r.delivery_variance)} L`], ["BL", r.bl_number ?? "—"],
    ["Véhicule", r.vehicle_registration ?? "—"], ["Chauffeur", r.driver_name ?? "—"],
    ["Scellés", r.seals ? `${r.seals}${r.seals_intact === false ? " (non intacts)" : r.seals_intact ? " (intacts)" : ""}` : "—"],
    ["Jauges avant / après", r.gauge_before != null ? `${fmt(r.gauge_before)} / ${fmt(r.gauge_after)} L` : "—"],
    ["Chargement", fmtDt(r.loaded_at)], ["Départ", fmtDt(r.departed_at)], ["Livraison", fmtDt(r.delivered_at)], ["Réception", fmtDt(r.received_at)],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-3">{r.reference}
          <Badge variant={SUPPLY_STATUS[r.status]?.variant}>{SUPPLY_STATUS[r.status]?.label}</Badge></DialogTitle></DialogHeader>

        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex-1 min-w-[90px] rounded px-2 py-1 text-[11px] text-center border ${i <= stepIdx && stepIdx >= 0 ? "bg-primary/15 border-primary text-foreground" : "border-border text-muted-foreground"}`}>
              {SUPPLY_STATUS[s].label}</div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
          {info.map(([k, v]) => <div key={k}><div className="text-muted-foreground text-xs">{k}</div><div className="font-medium">{v}</div></div>)}
        </div>
        {r.need_reason && <p className="text-sm"><span className="text-muted-foreground">Motif du besoin : </span>{r.need_reason}</p>}
        {r.observations && <p className="text-sm whitespace-pre-line"><span className="text-muted-foreground">Observations : </span>{r.observations}</p>}
        {r.stock_movement_id && <p className="text-sm text-primary">Entrée en stock générée automatiquement ({fmt(r.qty_received)} L).</p>}

        {stepForm && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Étape suivante</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stepForm}
              <div className="space-y-1"><Label>Observations (ajoutées à l'étape)</Label>
                <Textarea rows={2} value={d.observations} onChange={(e) => setD({ ...d, observations: e.target.value })} /></div>
            </CardContent></Card>
        )}

        {canWrite && !["received", "cancelled"].includes(r.status) && (canValidate || ["draft", "submitted", "rejected"].includes(r.status)) && (
          <Button variant="outline" className="text-destructive w-fit" onClick={() => setConfirmAction("cancel")}><Ban className="w-4 h-4 mr-1" />Annuler le dossier</Button>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-2">Historique</h4>
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Aucune étape</p> : (
            <ul className="space-y-1 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-primary pl-3">
                  <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span> — {fmtDt(e.created_at)} — {e.author_name ?? "?"}
                  {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Dialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{confirmAction === "reject" ? "Rejeter la demande" : "Annuler le dossier"}</DialogTitle></DialogHeader>
            <Label>Motif (obligatoire)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            <DialogFooter>
              <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(confirmAction!, {}, reason)}>Confirmer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
