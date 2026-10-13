import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { toast } from "sonner";
import { Plus, Wrench, History, AlertTriangle, Loader2, Search, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { availabilityPct, dueState, WARRANTY_SOON_DAYS } from "@/lib/maintenance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CATEGORIES: Record<string, string> = {
  tank: "Cuve", pump: "Pompe", nozzle: "Pistolet", generator: "Groupe électrogène", compressor: "Compresseur",
  tpe: "TPE", atg: "ATG (jaugeage auto)", extinguisher: "Extincteur", other: "Autre",
};
const ASSET_STATUS: Record<string, string> = { active: "En service", maintenance: "En maintenance", down: "En panne", retired: "Réformé" };
const WO_STATUS: Record<string, string> = { open: "Ouvert", in_progress: "En cours", done: "Terminé", cancelled: "Annulé" };
const PRIORITY: Record<string, string> = { low: "Faible", normal: "Normale", high: "Haute", critical: "Critique" };
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const statusVariant = (s: string) => (s === "down" ? "destructive" : s === "maintenance" ? "secondary" : s === "retired" ? "outline" : "default");

const AssetsMaintenanceModule = () => {
  const { tenantId, countryId, scopeQuery, scopeRow } = useScope();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Row[]>([]);
  const [parts, setParts] = useState<Row[]>([]);
  const [stations, setStations] = useState<Row[]>([]);
  const [depots, setDepots] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [periodDays, setPeriodDays] = useState(30);
  const [assetDlg, setAssetDlg] = useState<Row | null>(null);
  const [planDlg, setPlanDlg] = useState<Row | null>(null);
  const [woDlg, setWoDlg] = useState<Row | null>(null);
  const [historyAsset, setHistoryAsset] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    setLoading(true);
    const [a, p, w, pt, s, d] = await Promise.all([
      scopeQuery(db.from("maintenance_assets").select("*")).order("asset_number"),
      scopeQuery(db.from("maintenance_plans").select("*")).order("next_due_on"),
      scopeQuery(db.from("maintenance_work_orders").select("*")).order("opened_at", { ascending: false }),
      scopeQuery(db.from("maintenance_parts").select("*")),
      scopeQuery(db.from("stations").select("id,name")).order("name"),
      scopeQuery(db.from("depots").select("id,name")).order("name"),
    ]);
    setAssets(a.data ?? []); setPlans(p.data ?? []); setOrders(w.data ?? []); setParts(pt.data ?? []);
    setStations(s.data ?? []); setDepots(d.data ?? []);
    setLoading(false);
  }, [tenantId, countryId, scopeQuery]);
  useEffect(() => { load(); }, [load]);

  const assetById = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets]);
  const locName = (a?: Row) => !a ? "—" : a.location_type === "depot"
    ? `Dépôt ${depots.find((d) => d.id === a.depot_id)?.name ?? ""}` : stations.find((s) => s.id === a.station_id)?.name ?? "—";
  const assetLabel = (id: string) => { const a = assetById[id]; return a ? `${a.asset_number} · ${a.custom_category || CATEGORIES[a.category]}` : "—"; };

  const filteredAssets = assets.filter((a) =>
    (catFilter === "all" || a.category === catFilter) &&
    `${a.asset_number} ${a.model ?? ""} ${a.manufacturer ?? ""} ${locName(a)}`.toLowerCase().includes(search.toLowerCase()));

  // KPI
  const since = Date.now() - periodDays * 86_400_000;
  const periodOrders = orders.filter((o) => new Date(o.opened_at).getTime() >= since);
  const downtime = periodOrders.reduce((s, o) => s + Number(o.downtime_hours || 0), 0);
  const activeAssets = assets.filter((a) => a.status !== "retired");
  const costLabour = periodOrders.reduce((s, o) => s + Number(o.labour_cost || 0), 0);
  const costParts = periodOrders.reduce((s, o) => s + Number(o.parts_cost || 0), 0);
  const correctiveDone = periodOrders.filter((o) => o.kind === "corrective" && o.status === "done");
  const mttr = correctiveDone.length ? correctiveDone.reduce((s, o) => s + Number(o.downtime_hours), 0) / correctiveDone.length : 0;

  const alerts = useMemo(() => {
    const out: { level: "overdue" | "soon"; text: string }[] = [];
    plans.filter((p) => p.is_active).forEach((p) => {
      const st = dueState(p.next_due_on);
      if (st === "overdue" || st === "soon") out.push({ level: st, text: `${st === "overdue" ? "Échéance dépassée" : "Échéance proche"} : ${p.title} — ${assetLabel(p.asset_id)} (${p.next_due_on})` });
    });
    assets.forEach((a) => {
      const st = dueState(a.warranty_until, new Date(), WARRANTY_SOON_DAYS);
      if (a.status !== "retired" && (st === "overdue" || st === "soon")) out.push({ level: st, text: `Garantie ${st === "overdue" ? "expirée" : "bientôt expirée"} : ${a.asset_number} (${a.warranty_until})` });
      if (a.status === "down") out.push({ level: "overdue", text: `Équipement en panne : ${a.asset_number} — ${locName(a)}` });
    });
    return out.sort((x, y) => (x.level === y.level ? 0 : x.level === "overdue" ? -1 : 1));
  }, [plans, assets, stations, depots]); // eslint-disable-line react-hooks/exhaustive-deps

  const openHistory = async (a: Row) => {
    setHistoryAsset(a);
    const { data } = await db.from("maintenance_events").select("*").eq("asset_id", a.id).order("created_at", { ascending: false });
    setEvents(data ?? []);
  };

  const run = async (p: Promise<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return true;
  };

  const saveAsset = async () => {
    const f = assetDlg!;
    if (!f.asset_number || !f.category) return toast.error("Numéro et type obligatoires");
    const row = {
      location_type: f.location_type ?? "station", station_id: f.location_type === "depot" ? null : f.station_id || null,
      depot_id: f.location_type === "depot" ? f.depot_id || null : null, category: f.category, custom_category: f.custom_category || null,
      asset_number: f.asset_number, model: f.model || null, manufacturer: f.manufacturer || null, serial_number: f.serial_number || null,
      installed_on: f.installed_on || null, warranty_until: f.warranty_until || null, status: f.status ?? "active",
      location_detail: f.location_detail || null, notes: f.notes || null,
    };
    const ok = await run(f.id ? db.from("maintenance_assets").update(row).eq("id", f.id) : db.from("maintenance_assets").insert(scopeRow(row)), "Équipement enregistré");
    if (ok) setAssetDlg(null);
  };
  const savePlan = async () => {
    const f = planDlg!;
    if (!f.asset_id || !f.title || !f.frequency_days || !f.next_due_on) return toast.error("Champs obligatoires manquants");
    const row = { asset_id: f.asset_id, title: f.title, frequency_days: Number(f.frequency_days), next_due_on: f.next_due_on, provider: f.provider || null, is_active: f.is_active ?? true };
    const ok = await run(f.id ? db.from("maintenance_plans").update(row).eq("id", f.id) : db.from("maintenance_plans").insert(scopeRow(row)), "Plan enregistré");
    if (ok) setPlanDlg(null);
  };
  const saveWo = async (nextStatus?: string) => {
    const f = woDlg!;
    if (!f.asset_id) return toast.error("Équipement obligatoire");
    const row: Row = {
      technician: f.technician || null, provider: f.provider || null, priority: f.priority ?? "normal",
      failure_description: f.failure_description || null, labour_cost: Number(f.labour_cost || 0), report: f.report || null,
      downtime_hours: Number(f.downtime_hours || 0), status: nextStatus ?? f.status ?? "open",
    };
    const ok = await run(f.id ? db.from("maintenance_work_orders").update(row).eq("id", f.id)
      : db.from("maintenance_work_orders").insert(scopeRow({ ...row, asset_id: f.asset_id, plan_id: f.plan_id || null, kind: f.kind ?? "corrective" })), "Intervention enregistrée");
    if (ok) setWoDlg(null);
  };
  const addPart = async () => {
    const f = woDlg!;
    if (!f.part_name || !Number(f.part_qty)) return toast.error("Pièce et quantité obligatoires");
    const ok = await run(db.from("maintenance_parts").insert(scopeRow({ work_order_id: f.id, name: f.part_name, quantity: Number(f.part_qty), unit_cost: Number(f.part_cost || 0) })), "Pièce ajoutée");
    if (ok) setWoDlg({ ...f, part_name: "", part_qty: "", part_cost: "" });
  };

  const kpi = (label: string, value: string, sub?: string) => (
    <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</CardContent></Card>
  );
  const set = (setter: (r: Row) => void, r: Row, k: string) => (e: { target: { value: string } }) => setter({ ...r, [k]: e.target.value });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Assets & Maintenance</h2>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{[7, 30, 90, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} derniers jours</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpi("Disponibilité", `${availabilityPct(activeAssets.length, downtime, periodDays)} %`, `${fmt(downtime)} h d'immobilisation`)}
        {kpi("Équipements", String(activeAssets.length), `${assets.filter((a) => a.status === "down").length} en panne`)}
        {kpi("Interventions", String(periodOrders.length), `${orders.filter((o) => ["open", "in_progress"].includes(o.status)).length} ouvertes`)}
        {kpi("MTTR", `${mttr.toFixed(1)} h`, "temps moyen de réparation")}
        {kpi("Coût total", `${fmt(costLabour + costParts)} F`, `MO ${fmt(costLabour)} · pièces ${fmt(costParts)}`)}
        {kpi("Alertes", String(alerts.length), `${alerts.filter((a) => a.level === "overdue").length} critiques`)}
      </div>

      <Tabs defaultValue="assets">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="assets">Équipements</TabsTrigger>
          <TabsTrigger value="plans">Maintenance préventive</TabsTrigger>
          <TabsTrigger value="orders">Interventions</TabsTrigger>
          <TabsTrigger value="alerts">Alertes ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Select value={catFilter} onValueChange={setCatFilter}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous types</SelectItem>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Button onClick={() => setAssetDlg({ location_type: "station", category: "pump", status: "active" })}><Plus className="h-4 w-4 mr-1" />Équipement</Button>
          </div>
          <Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Type</TableHead><TableHead>Modèle / fabricant</TableHead><TableHead>Localisation</TableHead><TableHead>Installation</TableHead><TableHead>Garantie</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{filteredAssets.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.asset_number}</TableCell>
                <TableCell>{a.custom_category || CATEGORIES[a.category]}</TableCell>
                <TableCell>{[a.model, a.manufacturer].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell>{locName(a)}{a.location_detail ? ` · ${a.location_detail}` : ""}</TableCell>
                <TableCell>{a.installed_on ?? "—"}</TableCell>
                <TableCell>{a.warranty_until ?? "—"}</TableCell>
                <TableCell><Badge variant={statusVariant(a.status)}>{ASSET_STATUS[a.status]}</Badge></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setAssetDlg(a)}>Modifier</Button>
                  <Button size="sm" variant="ghost" onClick={() => setWoDlg({ asset_id: a.id, kind: "corrective", priority: "normal" })}>Panne</Button>
                  <Button size="icon" variant="ghost" onClick={() => openHistory(a)}><History className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>))}
              {!filteredAssets.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Aucun équipement</TableCell></TableRow>}
            </TableBody></Table>
        </TabsContent>

        <TabsContent value="plans" className="space-y-3">
          <Button onClick={() => setPlanDlg({ frequency_days: 90, is_active: true })} disabled={!assets.length}><Plus className="h-4 w-4 mr-1" />Plan préventif</Button>
          <Table><TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Équipement</TableHead><TableHead>Fréquence</TableHead><TableHead>Dernière</TableHead><TableHead>Prochaine échéance</TableHead><TableHead>Prestataire</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{plans.map((p) => { const st = dueState(p.next_due_on); return (
              <TableRow key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                <TableCell className="font-medium">{p.title}</TableCell><TableCell>{assetLabel(p.asset_id)}</TableCell>
                <TableCell>{p.frequency_days} j</TableCell><TableCell>{p.last_done_on ?? "—"}</TableCell>
                <TableCell><Badge variant={st === "overdue" ? "destructive" : st === "soon" ? "secondary" : "outline"}>{p.next_due_on}</Badge></TableCell>
                <TableCell>{p.provider ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setPlanDlg(p)}>Modifier</Button>
                  <Button size="sm" variant="ghost" disabled={!p.is_active} onClick={() => setWoDlg({ asset_id: p.asset_id, plan_id: p.id, kind: "preventive", priority: "normal", provider: p.provider })}><CalendarClock className="h-4 w-4 mr-1" />Lancer</Button>
                </TableCell>
              </TableRow>); })}
              {!plans.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Aucun plan</TableCell></TableRow>}
            </TableBody></Table>
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          <Button onClick={() => setWoDlg({ kind: "corrective", priority: "normal" })} disabled={!assets.length}><Plus className="h-4 w-4 mr-1" />Ticket d'intervention</Button>
          <Table><TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Type</TableHead><TableHead>Équipement</TableHead><TableHead>Priorité</TableHead><TableHead>Technicien</TableHead><TableHead>Immobilisation</TableHead><TableHead>Coût</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.number}</TableCell>
                <TableCell>{o.kind === "preventive" ? "Préventive" : "Corrective"}</TableCell>
                <TableCell>{assetLabel(o.asset_id)}</TableCell>
                <TableCell><Badge variant={o.priority === "critical" ? "destructive" : "outline"}>{PRIORITY[o.priority]}</Badge></TableCell>
                <TableCell>{[o.technician, o.provider].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell>{Number(o.downtime_hours).toFixed(1)} h</TableCell>
                <TableCell>{fmt(Number(o.labour_cost) + Number(o.parts_cost))} F</TableCell>
                <TableCell><Badge variant={o.status === "done" ? "default" : "secondary"}>{WO_STATUS[o.status]}</Badge></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => setWoDlg(o)}>{["done", "cancelled"].includes(o.status) ? "Voir" : "Traiter"}</Button></TableCell>
              </TableRow>))}
              {!orders.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Aucune intervention</TableCell></TableRow>}
            </TableBody></Table>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-md border p-3 text-sm ${a.level === "overdue" ? "border-destructive text-destructive" : "border-primary/50"}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />{a.text}
            </div>))}
          {!alerts.length && <p className="text-muted-foreground text-sm">Aucune alerte d'échéance.</p>}
          <p className="text-xs text-muted-foreground">Seuils : plan préventif à 15 jours, garantie à {WARRANTY_SOON_DAYS} jours.</p>
        </TabsContent>
      </Tabs>

      {/* Équipement */}
      <Dialog open={!!assetDlg} onOpenChange={(o) => !o && setAssetDlg(null)}>
        {assetDlg && <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{assetDlg.id ? "Modifier l'équipement" : "Nouvel équipement"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Numéro *</Label><Input value={assetDlg.asset_number ?? ""} onChange={set(setAssetDlg, assetDlg, "asset_number")} /></div>
            <div><Label>Type *</Label><Select value={assetDlg.category} onValueChange={(v) => setAssetDlg({ ...assetDlg, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            {assetDlg.category === "other" && <div className="col-span-2"><Label>Type personnalisé</Label><Input value={assetDlg.custom_category ?? ""} onChange={set(setAssetDlg, assetDlg, "custom_category")} placeholder="ex. Climatiseur, Caméra…" /></div>}
            <div><Label>Site</Label><Select value={assetDlg.location_type} onValueChange={(v) => setAssetDlg({ ...assetDlg, location_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="station">Station</SelectItem><SelectItem value="depot">Dépôt</SelectItem></SelectContent></Select></div>
            <div><Label>{assetDlg.location_type === "depot" ? "Dépôt" : "Station"} *</Label>
              <Select value={(assetDlg.location_type === "depot" ? assetDlg.depot_id : assetDlg.station_id) ?? ""} onValueChange={(v) => setAssetDlg({ ...assetDlg, [assetDlg.location_type === "depot" ? "depot_id" : "station_id"]: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{(assetDlg.location_type === "depot" ? depots : stations).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Modèle</Label><Input value={assetDlg.model ?? ""} onChange={set(setAssetDlg, assetDlg, "model")} /></div>
            <div><Label>Fabricant</Label><Input value={assetDlg.manufacturer ?? ""} onChange={set(setAssetDlg, assetDlg, "manufacturer")} /></div>
            <div><Label>N° de série</Label><Input value={assetDlg.serial_number ?? ""} onChange={set(setAssetDlg, assetDlg, "serial_number")} /></div>
            <div><Label>Emplacement précis</Label><Input value={assetDlg.location_detail ?? ""} onChange={set(setAssetDlg, assetDlg, "location_detail")} placeholder="ex. Îlot 2, local technique" /></div>
            <div><Label>Date d'installation</Label><Input type="date" value={assetDlg.installed_on ?? ""} onChange={set(setAssetDlg, assetDlg, "installed_on")} /></div>
            <div><Label>Fin de garantie</Label><Input type="date" value={assetDlg.warranty_until ?? ""} onChange={set(setAssetDlg, assetDlg, "warranty_until")} /></div>
            <div><Label>Statut</Label><Select value={assetDlg.status} onValueChange={(v) => setAssetDlg({ ...assetDlg, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ASSET_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={assetDlg.notes ?? ""} onChange={set(setAssetDlg, assetDlg, "notes")} /></div>
          </div>
          <DialogFooter><Button onClick={saveAsset}>Enregistrer</Button></DialogFooter>
        </DialogContent>}
      </Dialog>

      {/* Plan */}
      <Dialog open={!!planDlg} onOpenChange={(o) => !o && setPlanDlg(null)}>
        {planDlg && <DialogContent><DialogHeader><DialogTitle>Plan de maintenance préventive</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Équipement *</Label><Select value={planDlg.asset_id ?? ""} onValueChange={(v) => setPlanDlg({ ...planDlg, asset_id: v })} disabled={!!planDlg.id}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{assets.map((a) => <SelectItem key={a.id} value={a.id}>{assetLabel(a.id)}</SelectItem>)}</SelectContent></Select></div>
            <div className="col-span-2"><Label>Intitulé *</Label><Input value={planDlg.title ?? ""} onChange={set(setPlanDlg, planDlg, "title")} placeholder="ex. Vidange groupe électrogène" /></div>
            <div><Label>Fréquence (jours) *</Label><Input type="number" min={1} value={planDlg.frequency_days ?? ""} onChange={set(setPlanDlg, planDlg, "frequency_days")} /></div>
            <div><Label>Prochaine échéance *</Label><Input type="date" value={planDlg.next_due_on ?? ""} onChange={set(setPlanDlg, planDlg, "next_due_on")} /></div>
            <div><Label>Prestataire</Label><Input value={planDlg.provider ?? ""} onChange={set(setPlanDlg, planDlg, "provider")} /></div>
            <div><Label>Actif</Label><Select value={planDlg.is_active ? "1" : "0"} onValueChange={(v) => setPlanDlg({ ...planDlg, is_active: v === "1" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Oui</SelectItem><SelectItem value="0">Non</SelectItem></SelectContent></Select></div>
          </div>
          <p className="text-xs text-muted-foreground">À chaque intervention terminée, la prochaine échéance est recalculée automatiquement.</p>
          <DialogFooter><Button onClick={savePlan}>Enregistrer</Button></DialogFooter>
        </DialogContent>}
      </Dialog>

      {/* Intervention */}
      <Dialog open={!!woDlg} onOpenChange={(o) => !o && setWoDlg(null)}>
        {woDlg && (() => { const closed = ["done", "cancelled"].includes(woDlg.status); const woParts = parts.filter((p) => p.work_order_id === woDlg.id); return (
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{woDlg.number ?? "Nouveau ticket d'intervention"}</DialogTitle></DialogHeader>
            <fieldset disabled={closed} className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Équipement *</Label><Select value={woDlg.asset_id ?? ""} onValueChange={(v) => setWoDlg({ ...woDlg, asset_id: v })} disabled={!!woDlg.id}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger><SelectContent>{assets.map((a) => <SelectItem key={a.id} value={a.id}>{assetLabel(a.id)} — {locName(a)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Type</Label><Select value={woDlg.kind} onValueChange={(v) => setWoDlg({ ...woDlg, kind: v })} disabled={!!woDlg.id}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="corrective">Corrective (panne)</SelectItem><SelectItem value="preventive">Préventive</SelectItem></SelectContent></Select></div>
              <div><Label>Priorité</Label><Select value={woDlg.priority} onValueChange={(v) => setWoDlg({ ...woDlg, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2"><Label>Description de la panne {woDlg.kind === "corrective" && "*"}</Label><Textarea value={woDlg.failure_description ?? ""} onChange={set(setWoDlg, woDlg, "failure_description")} /></div>
              <div><Label>Technicien</Label><Input value={woDlg.technician ?? ""} onChange={set(setWoDlg, woDlg, "technician")} /></div>
              <div><Label>Prestataire</Label><Input value={woDlg.provider ?? ""} onChange={set(setWoDlg, woDlg, "provider")} /></div>
              <div><Label>Coût main d'œuvre (F)</Label><Input type="number" min={0} value={woDlg.labour_cost ?? ""} onChange={set(setWoDlg, woDlg, "labour_cost")} /></div>
              <div><Label>Immobilisation (h){woDlg.kind === "corrective" && " — calculée à la clôture"}</Label><Input type="number" min={0} value={woDlg.downtime_hours ?? ""} onChange={set(setWoDlg, woDlg, "downtime_hours")} disabled={woDlg.kind === "corrective"} /></div>
              <div className="col-span-2"><Label>Rapport d'intervention (obligatoire pour terminer)</Label><Textarea value={woDlg.report ?? ""} onChange={set(setWoDlg, woDlg, "report")} /></div>
            </fieldset>
            {woDlg.id && <div className="space-y-2">
              <Label>Pièces utilisées</Label>
              {woParts.map((p) => <div key={p.id} className="flex justify-between text-sm border-b py-1"><span>{p.name} × {p.quantity}</span><span>{fmt(p.quantity * p.unit_cost)} F</span></div>)}
              {!closed && <div className="flex gap-2"><Input placeholder="Pièce" value={woDlg.part_name ?? ""} onChange={set(setWoDlg, woDlg, "part_name")} /><Input className="w-20" type="number" placeholder="Qté" value={woDlg.part_qty ?? ""} onChange={set(setWoDlg, woDlg, "part_qty")} /><Input className="w-28" type="number" placeholder="P.U." value={woDlg.part_cost ?? ""} onChange={set(setWoDlg, woDlg, "part_cost")} /><Button variant="outline" onClick={addPart}>Ajouter</Button></div>}
              <p className="text-sm text-right">Total pièces : {fmt(woParts.reduce((s, p) => s + p.quantity * p.unit_cost, 0))} F</p>
            </div>}
            {!closed && <DialogFooter className="flex-wrap gap-2">
              {woDlg.id && <Button variant="outline" onClick={() => saveWo("cancelled")}>Annuler le ticket</Button>}
              <Button variant="secondary" onClick={() => saveWo()}>Enregistrer</Button>
              {woDlg.id && woDlg.status === "open" && <Button variant="secondary" onClick={() => saveWo("in_progress")}>Démarrer</Button>}
              {woDlg.id && <Button onClick={() => saveWo("done")}>Terminer</Button>}
            </DialogFooter>}
          </DialogContent>); })()}
      </Dialog>

      {/* Historique */}
      <Dialog open={!!historyAsset} onOpenChange={(o) => !o && setHistoryAsset(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Historique {historyAsset?.asset_number}</DialogTitle></DialogHeader>
          {events.map((e) => <div key={e.id} className="text-sm border-b py-2"><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR")}</span> — {e.event.replace("work_order_", "Intervention ").replace("created", "Création").replace("updated", "Modification").replace("status", "Changement de statut")}{e.details?.number ? ` ${e.details.number}` : ""}{e.details?.to ? ` → ${ASSET_STATUS[e.details.to]}` : ""}</div>)}
          {!events.length && <p className="text-sm text-muted-foreground">Aucun événement</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetsMaintenanceModule;
