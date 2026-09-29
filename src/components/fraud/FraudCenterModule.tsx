import { useCallback, useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { toast } from "sonner";
import { Eye, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SEVERITY: Record<string, { label: string; cls: string; points: number }> = {
  critique: { label: "Critique", cls: "border-destructive/50 bg-destructive/10 text-destructive", points: 35 },
  haute: { label: "Haute", cls: "border-primary/50 bg-primary/10 text-primary", points: 20 },
  moyenne: { label: "Moyenne", cls: "border-warning/40 bg-warning/10 text-warning", points: 10 },
  faible: { label: "Faible", cls: "border-muted-foreground/30 bg-muted text-muted-foreground", points: 5 },
};
const WORKFLOW: Record<string, string> = {
  new: "Nouveau", analysis: "En analyse", justification_requested: "Justification demandée",
  confirmed: "Confirmé", false_positive: "Faux positif", closed: "Clos",
};
const ACTIONS: Record<string, string> = {
  comment: "Commentaire", analyze: "Passer en analyse", request_justification: "Demander justification",
  confirm: "Confirmer la fraude", false_positive: "Faux positif", close: "Clore", reopen: "Rouvrir",
};
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Erreur";

/** Score : points par sévérité (faux positifs exclus, confirmés ×1,5), plafonné à 100. */
function riskOf(alerts: Row[]) {
  const factors: Record<string, { label: string; count: number; points: number }> = {};
  for (const a of alerts) {
    if (a.workflow === "false_positive") continue;
    const base = SEVERITY[a.severity]?.points ?? 5;
    const pts = a.workflow === "confirmed" ? base * 1.5 : a.workflow === "closed" ? base * 0.5 : base;
    const f = (factors[a.rule_code] ??= { label: a.title, count: 0, points: 0 });
    f.count += 1;
    f.points += pts;
  }
  const list = Object.values(factors).sort((x, y) => y.points - x.points);
  const score = Math.min(100, Math.round(list.reduce((s, f) => s + f.points, 0)));
  return { score, factors: list };
}
const scoreCls = (s: number) =>
  s >= 60 ? "text-destructive" : s >= 30 ? "text-warning" : "text-success";

export function FraudCenterModule() {
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin() as { isPlatformAdmin: boolean };
  const canRun = isPlatformAdmin || can("fraud", "create") || can("fraud", "validate");
  const canEdit = isPlatformAdmin || can("fraud", "edit") || can("fraud", "validate");
  const canValidate = isPlatformAdmin || can("fraud", "validate");

  const [stations, setStations] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [defaults, setDefaults] = useState<Row[]>([]);
  const [rules, setRules] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [start, setStart] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [stationF, setStationF] = useState("all");
  const [ruleF, setRuleF] = useState("all");
  const [sevF, setSevF] = useState("all");
  const [wfF, setWfF] = useState("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [riskStation, setRiskStation] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    setLoading(true);
    try {
      const [st, al, df, rl] = await Promise.all([
        scopeQuery(db.from("stations").select("id,name")).order("name"),
        scopeQuery(db.from("fraud_alerts").select("*")).gte("alert_date", start).lte("alert_date", end)
          .order("priority").order("alert_date", { ascending: false }).limit(1000),
        db.rpc("fraud_rule_defaults"),
        scopeQuery(db.from("fraud_rules").select("*")),
      ]);
      if (al.error) throw al.error;
      setStations(st.data ?? []);
      setAlerts(al.data ?? []);
      setDefaults(df.data ?? []);
      setRules(Object.fromEntries((rl.data ?? []).map((r: Row) => [r.rule_code, r])));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId, countryId, scopeQuery, start, end]);
  useEffect(() => { void load(); }, [load]);

  const stationName = useMemo(() => Object.fromEntries(stations.map((s) => [s.id, s.name])), [stations]);
  const ruleLabel = useMemo(() => Object.fromEntries(defaults.map((d) => [d.rule_code, d.label])), [defaults]);

  const filtered = alerts.filter((a) =>
    (stationF === "all" || a.station_id === stationF) &&
    (ruleF === "all" || a.rule_code === ruleF) &&
    (sevF === "all" || a.severity === sevF) &&
    (wfF === "all" || (wfF === "open" ? !["closed", "false_positive"].includes(a.workflow) : a.workflow === wfF)));

  const risk = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const a of alerts) if (a.station_id) (by[a.station_id] ??= []).push(a);
    return stations
      .map((s) => ({ id: s.id, name: s.name, ...riskOf(by[s.id] ?? []), alerts: (by[s.id] ?? []).length }))
      .sort((x, y) => y.score - x.score);
  }, [alerts, stations]);

  const runScan = async () => {
    setRunning(true);
    try {
      const { data, error } = await db.rpc("run_fraud_scan", { _tenant: tenantId, _country: countryId, _from: start, _to: end });
      if (error) throw error;
      toast.success(`${data ?? 0} nouvelle(s) alerte(s)`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const counts = {
    open: alerts.filter((a) => !["closed", "false_positive"].includes(a.workflow)).length,
    critique: alerts.filter((a) => a.severity === "critique" && !["closed", "false_positive"].includes(a.workflow)).length,
    confirmed: alerts.filter((a) => a.workflow === "confirmed").length,
    highRisk: risk.filter((r) => r.score >= 60).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-primary" />Fraud & Anomaly Center</h2>
          <p className="text-sm text-muted-foreground">Règles explicables : chaque alerte indique la règle, le seuil et les valeurs qui l'ont déclenchée.</p>
        </div>
        <div><Label>Du</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><Label>Au</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        {canRun && (
          <Button onClick={runScan} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}Lancer l'analyse
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Alertes ouvertes", counts.open], ["Critiques ouvertes", counts.critique], ["Fraudes confirmées", counts.confirmed], ["Stations à risque élevé", counts.highRisk]].map(([l, v]) => (
          <Card key={l as string} className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-2xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alertes</TabsTrigger>
          <TabsTrigger value="risk">Risk Score stations</TabsTrigger>
          <TabsTrigger value="rules">Règles</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={stationF} onValueChange={setStationF}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes stations</SelectItem>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
            <Select value={ruleF} onValueChange={setRuleF}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous types</SelectItem>{defaults.map((d) => <SelectItem key={d.rule_code} value={d.rule_code}>{d.label}</SelectItem>)}</SelectContent></Select>
            <Select value={sevF} onValueChange={setSevF}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes priorités</SelectItem>{Object.entries(SEVERITY).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            <Select value={wfF} onValueChange={setWfF}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Non closes</SelectItem><SelectItem value="all">Tous statuts</SelectItem>{Object.entries(WORKFLOW).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <Card className="glass-card"><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Priorité</TableHead><TableHead>Date</TableHead><TableHead>Station</TableHead><TableHead>Règle déclenchée</TableHead><TableHead>Explication</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-6"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                  : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucune alerte. Lancez l'analyse sur la période.</TableCell></TableRow>
                  : filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell><Badge variant="outline" className={SEVERITY[a.severity]?.cls}>{SEVERITY[a.severity]?.label}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(a.alert_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{stationName[a.station_id] ?? "—"}</TableCell>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{a.explanation}</TableCell>
                      <TableCell><Badge variant="secondary">{WORKFLOW[a.workflow]}</Badge></TableCell>
                      <TableCell><Button size="icon" variant="ghost" aria-label="Ouvrir l'alerte" onClick={() => setOpenId(a.id)}><Eye className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Score de 0 à 100 sur la période : Critique 35 pts, Haute 20, Moyenne 10, Faible 5 par alerte. Fraude confirmée ×1,5 ; alerte close ×0,5 ; faux positif 0. Plafonné à 100.
            Vert &lt; 30, Orange 30–59, Rouge ≥ 60.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {risk.map((r) => (
              <Card key={r.id} className="glass-card cursor-pointer" onClick={() => setRiskStation(riskStation === r.id ? null : r.id)}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <span className={`font-display text-3xl font-bold ${scoreCls(r.score)}`}>{r.score}</span>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className={`h-full ${r.score >= 60 ? "bg-destructive" : r.score >= 30 ? "bg-warning" : "bg-success"}`} style={{ width: `${r.score}%` }} /></div>
                  {r.factors.length === 0 ? <p className="text-muted-foreground">Aucun facteur de risque.</p>
                    : (riskStation === r.id ? r.factors : r.factors.slice(0, 3)).map((f) => (
                      <div key={f.label} className="flex justify-between"><span>{f.label} × {f.count}</span><span className="font-medium">+{Math.round(f.points)}</span></div>
                    ))}
                  {r.factors.length > 3 && riskStation !== r.id && <p className="text-xs text-muted-foreground">Cliquez pour voir tous les facteurs</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <RulesEditor defaults={defaults} rules={rules} canEdit={canValidate} tenantId={tenantId} countryId={countryId} onSaved={load} />
        </TabsContent>
      </Tabs>

      <AlertDialog id={openId} onClose={() => setOpenId(null)} onChanged={load} stationName={stationName}
        ruleLabel={ruleLabel} canEdit={canEdit} canValidate={canValidate} />
    </div>
  );
}

function RulesEditor({ defaults, rules, canEdit, tenantId, countryId, onSaved }: {
  defaults: Row[]; rules: Record<string, Row>; canEdit: boolean; tenantId: string | null; countryId: string | null; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, Row>>({});
  useEffect(() => {
    setDraft(Object.fromEntries(defaults.map((d) => {
      const r = rules[d.rule_code];
      return [d.rule_code, { is_enabled: r?.is_enabled ?? d.is_enabled, threshold: r?.threshold ?? d.threshold, window_days: r?.window_days ?? d.window_days, severity: r?.severity ?? d.severity }];
    })));
  }, [defaults, rules]);
  const set = (code: string, k: string, v: unknown) => setDraft((p) => ({ ...p, [code]: { ...p[code], [k]: v } }));
  const save = async (code: string) => {
    const v = draft[code];
    const { error } = await db.from("fraud_rules").upsert({
      tenant_id: tenantId, country_id: countryId, rule_code: code, is_enabled: v.is_enabled,
      threshold: Number(v.threshold), window_days: Number(v.window_days), severity: v.severity,
    }, { onConflict: "tenant_id,country_id,rule_code" });
    if (error) toast.error(errMsg(error)); else { toast.success("Règle enregistrée"); onSaved(); }
  };
  return (
    <Card className="glass-card"><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Actif</TableHead><TableHead>Règle</TableHead><TableHead>Seuil</TableHead><TableHead>Fenêtre (j)</TableHead><TableHead>Sévérité</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {defaults.map((d) => {
            const v = draft[d.rule_code]; if (!v) return null;
            const fuel = d.rule_code === "fuel_card";
            return (
              <TableRow key={d.rule_code}>
                <TableCell><Switch checked={!!v.is_enabled} disabled={!canEdit || fuel} onCheckedChange={(c) => set(d.rule_code, "is_enabled", c)} /></TableCell>
                <TableCell><p className="font-medium">{d.label}{rules[d.rule_code] ? "" : " (défaut)"}</p><p className="text-xs text-muted-foreground max-w-md">{d.description}</p></TableCell>
                <TableCell><div className="flex items-center gap-1"><Input type="number" min={0} className="w-20" value={v.threshold} disabled={!canEdit || fuel} onChange={(e) => set(d.rule_code, "threshold", e.target.value)} /><span className="text-xs text-muted-foreground">{d.unit}</span></div></TableCell>
                <TableCell><Input type="number" min={1} max={90} className="w-20" value={v.window_days} disabled={!canEdit || fuel} onChange={(e) => set(d.rule_code, "window_days", e.target.value)} /></TableCell>
                <TableCell>
                  <Select value={v.severity} disabled={!canEdit || fuel} onValueChange={(s) => set(d.rule_code, "severity", s)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(SEVERITY).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent></Select>
                </TableCell>
                <TableCell>{canEdit && !fuel && <Button size="icon" variant="ghost" aria-label="Enregistrer" onClick={() => save(d.rule_code)}><Save className="h-4 w-4" /></Button>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function AlertDialog({ id, onClose, onChanged, stationName, ruleLabel, canEdit, canValidate }: {
  id: string | null; onClose: () => void; onChanged: () => void; stationName: Record<string, string>; ruleLabel: Record<string, string>; canEdit: boolean; canValidate: boolean;
}) {
  const [alert, setAlert] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!id) return;
    const [a, e] = await Promise.all([
      db.from("fraud_alerts").select("*").eq("id", id).maybeSingle(),
      db.from("fraud_alert_events").select("*").eq("alert_id", id).order("created_at"),
    ]);
    setAlert(a.data); setEvents(e.data ?? []);
  }, [id]);
  useEffect(() => { setComment(""); void load(); }, [load]);

  const act = async (action: string) => {
    setBusy(true);
    const { error } = await db.rpc("fraud_alert_action", { _id: id, _action: action, _comment: comment });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(ACTIONS[action]); setComment(""); await load(); onChanged();
  };
  const wf = alert?.workflow;
  const available: string[] = [];
  if (canEdit) {
    available.push("comment");
    if (["new", "justification_requested"].includes(wf)) available.push("analyze");
    if (["new", "analysis"].includes(wf)) available.push("request_justification");
  }
  if (canValidate) {
    if (["analysis", "justification_requested"].includes(wf)) available.push("confirm");
    if (["new", "analysis", "justification_requested"].includes(wf)) available.push("false_positive");
    if (["confirmed", "false_positive"].includes(wf)) available.push("close");
    if (["confirmed", "false_positive", "closed"].includes(wf)) available.push("reopen");
  }
  const evidence = alert?.evidence ?? {};

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{alert?.title ?? "Alerte"}</DialogTitle></DialogHeader>
        {alert && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={SEVERITY[alert.severity]?.cls}>{SEVERITY[alert.severity]?.label}</Badge>
              <Badge variant="secondary">{WORKFLOW[alert.workflow]}</Badge>
              <span className="text-muted-foreground">{stationName[alert.station_id] ?? "—"} · {format(new Date(alert.alert_date), "dd/MM/yyyy")}</span>
            </div>
            <div className="rounded-md border border-border p-3 space-y-1">
              <p className="font-medium">Pourquoi cette alerte ?</p>
              <p>{alert.explanation}</p>
              <p className="text-xs text-muted-foreground">Règle : {ruleLabel[alert.rule_code] ?? alert.rule_code} · seuil {String(evidence.threshold ?? "—")} · fenêtre {String(evidence.window_days ?? "—")} j</p>
            </div>
            <details><summary className="cursor-pointer text-muted-foreground">Données sources</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(evidence, null, 2)}</pre></details>
            {available.length > 0 && (
              <div className="space-y-2">
                <Textarea placeholder="Commentaire (obligatoire sauf « Passer en analyse »)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {available.map((a) => (
                    <Button key={a} size="sm" variant={a === "confirm" ? "destructive" : a === "comment" ? "outline" : "secondary"} disabled={busy} onClick={() => act(a)}>{ACTIONS[a]}</Button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="font-medium mb-1">Historique</p>
              {events.length === 0 ? <p className="text-muted-foreground">Aucune action.</p> : (
                <ul className="space-y-1">{events.map((e) => (
                  <li key={e.id} className="border-l-2 border-primary/40 pl-2">
                    <span className="text-muted-foreground">{format(new Date(e.created_at), "dd/MM/yyyy HH:mm")} · {e.author_name ?? "—"}</span> — {ACTIONS[e.action] ?? e.action}
                    {e.from_workflow !== e.to_workflow && ` (${WORKFLOW[e.from_workflow]} → ${WORKFLOW[e.to_workflow]})`}
                    {e.comment && <p>{e.comment}</p>}
                  </li>))}</ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
