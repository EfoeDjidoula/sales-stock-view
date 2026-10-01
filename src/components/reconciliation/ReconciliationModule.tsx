import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { toast } from "sonner";
import { Eye, Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const RECON_RESULT: Record<string, { label: string; cls: string }> = {
  conforme: { label: "Conforme", cls: "border-success/40 bg-success/10 text-success" },
  surveiller: { label: "À surveiller", cls: "border-warning/40 bg-warning/10 text-warning" },
  anomalie: { label: "Anomalie", cls: "border-primary/50 bg-primary/10 text-primary" },
  critique: { label: "Critique", cls: "border-destructive/50 bg-destructive/10 text-destructive" },
};
const WORKFLOW: Record<string, string> = {
  open: "Ouverte", analysis: "En analyse", justification_requested: "Justification demandée",
  justified: "Justifiée", validated: "Validée", escalated: "Escaladée",
};
const ACTIONS: Record<string, string> = {
  compute: "Calcul", comment: "Commentaire", analyze: "Analyse", request_justification: "Demande de justification",
  justify: "Justification", escalate: "Escalade", validate: "Validation", reopen: "Réouverture",
};
const fmt = (n: unknown) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Erreur";

export function ReconciliationModule() {
  const { t } = useLanguage();
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin() as { isPlatformAdmin: boolean };
  const canRun = isPlatformAdmin || can("reconciliation", "create") || can("reconciliation", "validate");
  const canAnalyze = isPlatformAdmin || can("reconciliation", "edit") || can("reconciliation", "validate");
  const canValidate = isPlatformAdmin || can("reconciliation", "validate");

  const [stations, setStations] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [start, setStart] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [stationF, setStationF] = useState("all");
  const [resultF, setResultF] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [s, p, r] = await Promise.all([
      scopeQuery(db.from("stations").select("id,name,status")).order("name"),
      scopeQuery(db.from("petroleum_products").select("id,name")).order("name"),
      scopeQuery(db.from("reconciliations").select("*")).gte("recon_date", start).lte("recon_date", end).order("recon_date", { ascending: false }),
    ]);
    setStations(s.data ?? []); setProducts(p.data ?? []); setRows(r.data ?? []);
    if (r.error) toast.error(errMsg(r.error));
    setLoading(false);
  }, [tenantId, scopeQuery, start, end]);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    const targets = stationF === "all" ? stations.filter((s) => s.status !== "inactive") : stations.filter((s) => s.id === stationF);
    const days: string[] = [];
    for (let d = new Date(start); format(d, "yyyy-MM-dd") <= end && days.length < 31; d = new Date(d.getTime() + 86400000)) days.push(format(d, "yyyy-MM-dd"));
    setRunning(true);
    let ok = 0, skipped = 0;
    for (const s of targets) for (const day of days) {
      const { error } = await db.rpc("reconcile_station_day", { _station: s.id, _date: day });
      if (error) skipped++; else ok++;
    }
    setRunning(false);
    toast.success(`${ok} réconciliation(s) calculée(s)${skipped ? ` · ${skipped} ignorée(s) (validées ou refusées)` : ""}`);
    load();
  };

  const stName = (id: string) => stations.find((s) => s.id === id)?.name ?? "—";
  const filtered = rows.filter((r) => (stationF === "all" || r.station_id === stationF) && (resultF === "all" || r.result === resultF));
  const counts = useMemo(() => Object.fromEntries(Object.keys(RECON_RESULT).map((k) => [k, rows.filter((r) => r.result === k).length])), [rows]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">{t("Résultats")}</TabsTrigger>
          <TabsTrigger value="tolerances">{t("Seuils de tolérance")}</TabsTrigger>
        </TabsList>
        <TabsContent value="results" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(RECON_RESULT).map(([k, v]) => (
              <button key={k} onClick={() => setResultF(resultF === k ? "all" : k)} className={`rounded-lg border p-3 text-left ${v.cls} ${resultF === k ? "ring-2 ring-ring" : ""}`}>
                <div className="text-xs">{v.label}</div><div className="font-display text-2xl font-bold">{counts[k] ?? 0}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>{t("Du")}</Label><Input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="w-40" /></div>
            <div><Label>{t("Au")}</Label><Input type="date" value={end} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setEnd(e.target.value)} className="w-40" /></div>
            <Select value={stationF} onValueChange={setStationF}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("Toutes les stations")}</SelectItem>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            {canRun && <Button onClick={run} disabled={running || !stations.length}>{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("Lancer la réconciliation")}</Button>}
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("Date")}</TableHead><TableHead>{t("Station")}</TableHead><TableHead className="text-right">{t("Ventes (L)")}</TableHead><TableHead className="text-right">{t("Ventes (F)")}</TableHead>
                <TableHead className="text-right">{t("Encaissé (F)")}</TableHead><TableHead className="text-right">{t("Écart vol. (L)")}</TableHead><TableHead className="text-right">{t("Écart valeur (F)")}</TableHead>
                <TableHead>{t("Résultat")}</TableHead><TableHead>{t("Suivi")}</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={10} className="text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
                  : filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.recon_date), "dd/MM/yyyy")}</TableCell><TableCell>{stName(r.station_id)}</TableCell>
                      <TableCell className="text-right">{fmt(r.sales_volume)}</TableCell><TableCell className="text-right">{fmt(r.sales_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.collected_amount)}</TableCell><TableCell className="text-right">{fmt(r.volume_variance)}</TableCell>
                      <TableCell className="text-right">{fmt(r.value_variance)}</TableCell>
                      <TableCell><Badge variant="outline" className={RECON_RESULT[r.result]?.cls}>{RECON_RESULT[r.result]?.label}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{WORKFLOW[r.workflow]}</Badge></TableCell>
                      <TableCell><Button size="icon" variant="ghost" aria-label={t("Ouvrir")} onClick={() => setOpenId(r.id)}><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                {!loading && !filtered.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">{t("Aucune réconciliation sur la période. Cliquez sur « Lancer la réconciliation ».")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="tolerances">
          <Tolerances tenantId={tenantId} countryId={countryId} products={products} canEdit={canValidate} />
        </TabsContent>
      </Tabs>
      {openId && <Detail id={openId} stationName={stName} onClose={() => { setOpenId(null); load(); }} canAnalyze={canAnalyze} canValidate={canValidate} canRun={canRun} />}
    </div>
  );
}

function Detail({ id, stationName, onClose, canAnalyze, canValidate, canRun }: { id: string; stationName: (id: string) => string; onClose: () => void; canAnalyze: boolean; canValidate: boolean; canRun: boolean }) {
  const { t } = useLanguage();
  const [r, setR] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      db.from("reconciliations").select("*").eq("id", id).single(),
      db.from("reconciliation_events").select("*").eq("reconciliation_id", id).order("created_at", { ascending: false }),
    ]);
    setR(a.data); setEvents(b.data ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string) => {
    setBusy(true);
    const { error } = await db.rpc("reconciliation_action", { _id: id, _action: action, _comment: comment });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(ACTIONS[action]); setComment(""); load();
  };
  const recompute = async () => {
    if (!r) return;
    setBusy(true);
    const { error } = await db.rpc("reconcile_station_day", { _station: r.station_id, _date: r.recon_date });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Recalculée"); load();
  };
  const d = r?.details ?? {};
  const validated = r?.workflow === "validated";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t("Réconciliation —")} {r ? `${stationName(r.station_id)} · ${format(new Date(r.recon_date), "dd/MM/yyyy")}` : "…"}</DialogTitle></DialogHeader>
        {!r ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={RECON_RESULT[r.result]?.cls}>{RECON_RESULT[r.result]?.label}</Badge>
              <Badge variant="secondary">{WORKFLOW[r.workflow]}</Badge>
              <Badge variant="outline">{t("Clôture :")} {d.closure_status ?? "absente"}</Badge>
            </div>
            <Card><CardHeader><CardTitle className="text-base">{t("Volumes par produit")}</CardTitle></CardHeader><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("Produit")}</TableHead><TableHead className="text-right">{t("Index pistolets")}</TableHead><TableHead className="text-right">{t("Ventes enreg.")}</TableHead>
                  <TableHead className="text-right">{t("Sorties cuves")}</TableHead><TableHead className="text-right">{t("Écart jaugeage")}</TableHead><TableHead className="text-right">{t("Ajustements")}</TableHead>
                  <TableHead className="text-right">{t("Index journal")}</TableHead><TableHead className="text-right">{t("Écart %")}</TableHead><TableHead className="text-right">{t("Écart F")}</TableHead><TableHead>{t("Résultat")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(d.products ?? []).map((l: Row) => (
                    <TableRow key={l.product_id}>
                      <TableCell>{l.product}</TableCell><TableCell className="text-right">{fmt(l.index_volume)}</TableCell><TableCell className="text-right">{fmt(l.sales_volume)}</TableCell>
                      <TableCell className="text-right">{fmt(l.tank_out)}</TableCell><TableCell className="text-right">{fmt(l.gauge_variance)}</TableCell><TableCell className="text-right">{fmt(l.adjustments)}</TableCell>
                      <TableCell className="text-right">{fmt(l.legacy_index_volume)}</TableCell><TableCell className="text-right">{Number(l.variance_pct).toFixed(2)} %</TableCell>
                      <TableCell className="text-right">{fmt(l.variance_amount)}</TableCell>
                      <TableCell><Badge variant="outline" className={RECON_RESULT[l.result]?.cls}>{RECON_RESULT[l.result]?.label}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">{t("Encaissements")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="grid gap-2 md:grid-cols-5">
                <div>{t("Ventes :")} <b>{fmt(r.sales_amount)} F</b></div><div>{t("Encaissé :")} <b>{fmt(r.collected_amount)} F</b></div>
                <div>{t("Espèces :")} <b>{fmt(d.cash)} F</b></div><div>Fuel cards : <b>{fmt(d.fuel_cards)} F</b></div><div>{t("Crédit B2B :")} <b>{fmt(d.b2b_credit)} F</b></div>
              </div>
              <div className="flex items-center gap-2">{t("Écart d'encaissement :")} <b>{fmt(r.value_variance)} F</b>
                {d.payment_result && <Badge variant="outline" className={RECON_RESULT[d.payment_result]?.cls}>{RECON_RESULT[d.payment_result]?.label}</Badge>}</div>
              <div className="flex flex-wrap gap-2">{(d.payments ?? []).map((p: Row, i: number) => <Badge key={i} variant="secondary">{p.method} : {fmt(p.amount)} F</Badge>)}</div>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-base">{t("Traitement du contrôleur")}</CardTitle></CardHeader><CardContent className="space-y-2">
              <Textarea placeholder={t("Commentaire, analyse, justification…")} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => act("comment")}>{t("Commenter")}</Button>
                {canAnalyze && !validated && <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act("analyze")}>{t("Passer en analyse")}</Button>
                  <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => act("request_justification")}>{t("Demander justification")}</Button>
                  <Button size="sm" variant="destructive" disabled={busy || !comment.trim()} onClick={() => act("escalate")}>{t("Escalader")}</Button>
                </>}
                {r.workflow === "justification_requested" && <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => act("justify")}>{t("Fournir la justification")}</Button>}
                {canValidate && !validated && <Button size="sm" disabled={busy || !comment.trim()} onClick={() => act("validate")}>{t("Valider")}</Button>}
                {canValidate && validated && <Button size="sm" variant="outline" disabled={busy || !comment.trim()} onClick={() => act("reopen")}>{t("Rouvrir")}</Button>}
                {canRun && !validated && <Button size="sm" variant="ghost" disabled={busy} onClick={recompute}><RefreshCw className="mr-1 h-4 w-4" />{t("Recalculer")}</Button>}
              </div>
              <p className="text-xs text-muted-foreground">{t("Un commentaire est obligatoire pour chaque action (sauf « Passer en analyse »).")}</p>
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-base">{t("Historique")}</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {events.map((e) => (
                <div key={e.id} className="flex flex-wrap gap-2 border-b border-border py-1">
                  <span className="text-muted-foreground">{format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}</span>
                  <b>{ACTIONS[e.action] ?? e.action}</b>
                  {e.to_workflow && <span>→ {WORKFLOW[e.to_workflow]}</span>}
                  {e.result && <Badge variant="outline" className={RECON_RESULT[e.result]?.cls}>{RECON_RESULT[e.result]?.label}</Badge>}
                  <span>{e.author_name ?? ""}</span>{e.comment && <span className="italic">« {e.comment} »</span>}
                </div>
              ))}
            </CardContent></Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const FIELDS: [string, string][] = [
  ["vol_watch_pct", "Volume à surveiller (%)"], ["vol_anomaly_pct", "Volume anomalie (%)"], ["vol_critical_pct", "Volume critique (%)"],
  ["amt_watch", "Valeur à surveiller (F)"], ["amt_anomaly", "Valeur anomalie (F)"], ["amt_critical", "Valeur critique (F)"],
];
const DEFAULTS: Row = { vol_watch_pct: 0.3, vol_anomaly_pct: 0.5, vol_critical_pct: 1, amt_watch: 5000, amt_anomaly: 20000, amt_critical: 100000 };

function Tolerances({ tenantId, countryId, products, canEdit }: { tenantId: string | null; countryId: string | null; products: Row[]; canEdit: boolean }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Record<string, Row>>({});
  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    const { data } = await db.from("reconciliation_tolerances").select("*").eq("tenant_id", tenantId).eq("country_id", countryId);
    setItems(Object.fromEntries((data ?? []).map((t: Row) => [t.product_id ?? "default", t])));
  }, [tenantId, countryId]);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, vals: Row) => {
    const row = { tenant_id: tenantId, country_id: countryId, product_id: key === "default" ? null : key, ...Object.fromEntries(FIELDS.map(([f]) => [f, Number(vals[f])])) };
    if (Object.values(row).some((v) => typeof v === "number" && (Number.isNaN(v) || v < 0))) return toast.error("Valeurs invalides");
    const existing = items[key];
    const { error } = existing ? await db.from("reconciliation_tolerances").update(row).eq("id", existing.id) : await db.from("reconciliation_tolerances").insert(row);
    if (error) return toast.error(error.message.includes("check") ? "Les seuils doivent être croissants (surveiller ≤ anomalie ≤ critique)" : error.message);
    toast.success("Seuils enregistrés"); load();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("Seuils pour la société et le pays actifs. Un seuil produit remplace le seuil par défaut. Écart en % du volume vendu, écart de valeur en FCFA.")}</p>
      {[{ id: "default", name: "Par défaut (tous produits + encaissements)" }, ...products].map((p) => (
        <TolRow key={p.id} title={p.name} initial={items[p.id] ?? (p.id === "default" ? DEFAULTS : items.default ?? DEFAULTS)} custom={!!items[p.id]} canEdit={canEdit} onSave={(v) => save(p.id, v)} />
      ))}
    </div>
  );
}

function TolRow({ title, initial, custom, canEdit, onSave }: { title: string; initial: Row; custom: boolean; canEdit: boolean; onSave: (v: Row) => void }) {
  const { t } = useLanguage();
  const [v, setV] = useState<Row>(initial);
  useEffect(() => setV(initial), [initial]);
  return (
    <Card><CardContent className="space-y-2 p-4">
      <div className="flex items-center justify-between"><b>{title}</b>{!custom && <Badge variant="secondary">{t("Hérité")}</Badge>}</div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {FIELDS.map(([f, l]) => <div key={f}><Label className="text-xs">{l}</Label><Input type="number" min={0} step="any" disabled={!canEdit} value={v[f] ?? ""} onChange={(e) => setV({ ...v, [f]: e.target.value })} /></div>)}
      </div>
      {canEdit && <Button size="sm" onClick={() => onSave(v)}><Save className="mr-1 h-4 w-4" />{t("Enregistrer")}</Button>}
    </CardContent></Card>
  );
}
