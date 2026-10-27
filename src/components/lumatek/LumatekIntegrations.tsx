import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Plus, KeyRound, Play, Plug, RefreshCw, RotateCw, Trash2 } from "lucide-react";

export const CATEGORIES: Record<string, string> = {
  erp: "ERP / comptabilité", banking: "Banques", mobile_money: "Mobile Money", pos: "POS / TPE",
  gps: "GPS", atg: "ATG / jauges", iot: "IoT", messaging: "Email / SMS",
};
const SUGGESTED: Record<string, string[]> = {
  erp: ["generic_rest", "odoo", "sap", "sage"], banking: ["generic_rest", "camt053", "ebics"],
  mobile_money: ["generic_rest", "mtn_momo", "moov_money", "orange_money"], pos: ["generic_rest", "doms", "wayne_fusion"],
  gps: ["generic_rest", "traccar", "geotab"], atg: ["generic_rest", "veeder_root", "opw"],
  iot: ["generic_rest", "mqtt_bridge"], messaging: ["generic_rest", "infobip", "twilio", "termii"],
};
const STATUS_VARIANT: Record<string, string> = { active: "bg-emerald-500/15 text-emerald-300", error: "bg-destructive/20 text-destructive", paused: "bg-amber-500/15 text-amber-300", draft: "bg-muted text-muted-foreground", disabled: "bg-muted text-muted-foreground" };
const db = supabase as any;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");
const INTERVAL_LABELS: Record<number, string> = { 60: "Toutes les heures", 120: "Toutes les 2 h", 240: "Toutes les 4 h", 360: "Toutes les 6 h", 720: "Toutes les 12 h", 1440: "Une fois par jour" };
const errMsg = (e: any) => e?.message ?? String(e);

function useData() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const [t, tc, c, j, l, m] = await Promise.all([
        db.from("tenants").select("id,name").order("name"),
        db.from("tenant_countries").select("tenant_id,country_id,countries(name)").eq("is_active", true),
        db.from("integration_connectors").select("*").order("created_at", { ascending: false }),
        db.from("integration_sync_jobs").select("*").order("created_at", { ascending: false }).limit(300),
        db.from("integration_sync_logs").select("*").order("created_at", { ascending: false }).limit(300),
        db.from("integration_mappings").select("*").order("entity"),
      ]);
      for (const r of [t, tc, c, j, l, m]) if (r.error) throw r.error;
      return { tenants: t.data, tcs: tc.data, connectors: c.data, jobs: j.data, logs: l.data, mappings: m.data };
    },
  });
}

export function LumatekIntegrations() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useData();
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [cred, setCred] = useState<string | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  const act = async (action: string, id: string | null, payload: Record<string, unknown>) => {
    const { data: r, error } = await db.rpc("integration_action", { _action: action, _id: id, _data: payload });
    if (error) { toast.error(errMsg(error)); return null; }
    reload(); return r;
  };
  const run = async (id: string, job_type: string) => {
    const r = await act("enqueue", id, { job_type });
    if (!r) return;
    if (r.deduplicated) toast.info("Job déjà planifié pour cette minute (idempotence)");
    const { data: out, error } = await supabase.functions.invoke("integration-hub", { body: { action: "run", connector_id: id } });
    if (error) toast.error(errMsg(error)); else toast.success(`${out.processed} job(s) traité(s)`);
    reload();
  };

  const tenantName = (id: string) => data?.tenants.find((t: any) => t.id === id)?.name ?? "—";
  const countryName = (tid: string, cid: string | null) => cid ? data?.tcs.find((x: any) => x.tenant_id === tid && x.country_id === cid)?.countries?.name ?? "—" : "Tous pays";
  const list = useMemo(() => (data?.connectors ?? []).filter((c: any) => cat === "all" || c.category === cat), [data, cat]);
  const current = data?.connectors.find((c: any) => c.id === sel);

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const kpi = (label: string, v: number) => <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{v}</p></CardContent></Card>;
  const cs = data?.connectors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-semibold">Intégrations Enterprise</h2>
          <p className="text-sm text-muted-foreground">Connecteurs multi-fournisseurs par client et pays. Les identifiants sont chiffrés côté serveur et jamais renvoyés au navigateur.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Actualiser</Button>
          <Button size="sm" onClick={() => setCreate(true)}><Plus className="mr-1 h-4 w-4" />Nouveau connecteur</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi("Connecteurs", cs.length)}{kpi("Actifs", cs.filter((c: any) => c.status === "active").length)}
        {kpi("En erreur", cs.filter((c: any) => c.status === "error" || c.last_error).length)}
        {kpi("Jobs en échec définitif", (data?.jobs ?? []).filter((j: any) => j.status === "dead").length)}
      </div>
      <Select value={cat} onValueChange={setCat}>
        <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Toutes catégories</SelectItem>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
      </Select>
      <Card><CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Connecteur</TableHead><TableHead>Catégorie</TableHead><TableHead>Client / pays</TableHead><TableHead>Statut</TableHead><TableHead>Identifiants</TableHead><TableHead>Dernière synchro</TableHead><TableHead>Prochaine synchro</TableHead><TableHead>Erreur</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Aucun connecteur</TableCell></TableRow>}
            {list.map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setSel(c.id)}>
                <TableCell><div className="font-medium">{c.name}</div><div className="font-mono text-xs text-muted-foreground">{c.provider} · {c.environment}</div></TableCell>
                <TableCell>{CATEGORIES[c.category]}</TableCell>
                <TableCell>{tenantName(c.tenant_id)}<div className="text-xs text-muted-foreground">{countryName(c.tenant_id, c.country_id)}</div></TableCell>
                <TableCell><Badge className={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                <TableCell className="text-xs">{c.has_credentials ? c.credential_hint : <span className="text-muted-foreground">Non configurés</span>}</TableCell>
                <TableCell className="text-xs">{fmt(c.last_sync_at)}</TableCell>
                <TableCell className="text-xs">{c.sync_interval_minutes ? <><Clock className="mr-1 inline h-3 w-3 text-muted-foreground" />{fmt(c.next_run_at)}<div className="text-muted-foreground">{INTERVAL_LABELS[c.sync_interval_minutes]}</div></> : <span className="text-muted-foreground">Manuelle</span>}</TableCell>
                <TableCell className="max-w-48 truncate text-xs text-destructive">{c.last_error ?? ""}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()} className="flex gap-1">
                  <Button size="icon" variant="ghost" title="Identifiants" onClick={() => setCred(c.id)}><KeyRound className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Tester la connexion" onClick={() => run(c.id, "test")}><Plug className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Synchroniser" onClick={() => run(c.id, "pull")}><Play className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {current && <ConnectorDetail c={current} data={data} act={act} onClose={() => setSel(null)} />}
      <CreateDialog open={create} onClose={() => setCreate(false)} data={data} act={act} />
      <CredentialsDialog id={cred} onClose={() => setCred(null)} onSaved={reload} />
    </div>
  );
}

function CreateDialog({ open, onClose, data, act }: any) {
  const [f, setF] = useState({ tenant_id: "", country_id: "", category: "erp", provider: "generic_rest", name: "", environment: "sandbox", direction: "inbound", config: '{\n  "base_url": "https://",\n  "auth": "bearer",\n  "test_path": "/health",\n  "pull_path": "/"\n}' });
  const countries = (data?.tcs ?? []).filter((x: any) => x.tenant_id === f.tenant_id);
  const submit = async () => {
    let config; try { config = JSON.parse(f.config); } catch { toast.error("Configuration JSON invalide"); return; }
    if (!f.tenant_id || !f.name.trim()) { toast.error("Client et nom requis"); return; }
    const r = await act("create", null, { ...f, country_id: f.country_id === "all" ? "" : f.country_id, config });
    if (r) { toast.success("Connecteur créé (brouillon)"); onClose(); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouveau connecteur</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Select value={f.tenant_id} onValueChange={(v) => setF({ ...f, tenant_id: v, country_id: "" })}><SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>{(data?.tenants ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          <Select value={f.country_id || "all"} onValueChange={(v) => setF({ ...f, country_id: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous pays du client</SelectItem>{countries.map((x: any) => <SelectItem key={x.country_id} value={x.country_id}>{x.countries?.name}</SelectItem>)}</SelectContent></Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v, provider: "generic_rest" })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
            <Input list="providers" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="fournisseur" />
            <datalist id="providers">{SUGGESTED[f.category].map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nom (ex. Odoo compta siège)" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.environment} onValueChange={(v) => setF({ ...f, environment: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent></Select>
            <Select value={f.direction} onValueChange={(v) => setF({ ...f, direction: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="inbound">Entrant</SelectItem><SelectItem value="outbound">Sortant</SelectItem><SelectItem value="bidirectional">Bidirectionnel</SelectItem></SelectContent></Select>
          </div>
          <Textarea rows={6} className="font-mono text-xs" value={f.config} onChange={(e) => setF({ ...f, config: e.target.value })} />
          <p className="text-xs text-muted-foreground">Configuration non sensible uniquement. Les mots de passe, jetons et clés sont refusés ici et se saisissent dans « Identifiants ».</p>
        </div>
        <DialogFooter><Button onClick={submit}>Créer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsDialog({ id, onClose, onSaved }: any) {
  const [rows, setRows] = useState([{ k: "token", v: "" }]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const credentials = Object.fromEntries(rows.filter((r) => r.k && r.v).map((r) => [r.k, r.v]));
    if (!Object.keys(credentials).length) { toast.error("Aucune valeur"); return; }
    setBusy(true);
    const { error } = await supabase.functions.invoke("integration-hub", { body: { action: "set_credentials", connector_id: id, credentials } });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    setRows([{ k: "token", v: "" }]); toast.success("Identifiants chiffrés et enregistrés"); onSaved(); onClose();
  };
  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) { setRows([{ k: "token", v: "" }]); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Identifiants sécurisés</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Les valeurs sont chiffrées sur le serveur et remplacent les précédentes. Elles ne seront plus jamais affichées.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Select value={r.k} onValueChange={(k) => setRows(rows.map((x, j) => j === i ? { ...x, k } : x))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{["token", "api_key", "username", "password", "client_id", "client_secret", "webhook_secret"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="password" autoComplete="off" value={r.v} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} />
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setRows([...rows, { k: "password", v: "" }])}>Ajouter un champ</Button>
        <DialogFooter><Button disabled={busy} onClick={save}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleSection({ c, act }: any) {
  const [value, setValue] = useState<string>(c.sync_interval_minutes ? String(c.sync_interval_minutes) : "off");
  const [busy, setBusy] = useState(false);
  const save = async (v: string) => {
    setBusy(true);
    const r = await act("set_schedule", c.id, { interval_minutes: v === "off" ? null : Number(v) });
    setBusy(false);
    if (r) { setValue(v); toast.success(v === "off" ? "Planification désactivée" : `Synchronisation automatique : ${INTERVAL_LABELS[Number(v)]}`); }
  };
  const upcoming = c.sync_interval_minutes && c.next_run_at
    ? Array.from({ length: 5 }, (_, i) => new Date(new Date(c.next_run_at).getTime() + i * c.sync_interval_minutes * 60000))
    : [];
  return (
    <div className="space-y-2 rounded border border-border p-2">
      <h4 className="flex items-center gap-1 text-sm font-semibold"><Clock className="h-4 w-4" />Planification automatique</h4>
      <div className="flex gap-1">
        <Select value={value} disabled={busy} onValueChange={save}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Désactivée (manuelle)</SelectItem>
            {Object.entries(INTERVAL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {c.sync_interval_minutes ? (
        <>
          <p className="text-xs text-muted-foreground">
            Prochaine exécution : <b className="text-foreground">{fmt(c.next_run_at)}</b>
            {c.status !== "active" && <span className="text-amber-400"> — le connecteur doit être actif pour qu'elle parte.</span>}
          </p>
          {upcoming.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">Prochaines exécutions prévues</p>
              {upcoming.map((d, i) => <p key={i} className="font-mono text-xs text-muted-foreground">{d.toLocaleString("fr-FR")}</p>)}
            </div>
          )}
        </>
      ) : <p className="text-xs text-muted-foreground">Aucune exécution automatique. Utilisez « Synchroniser » pour lancer manuellement.</p>}
    </div>
  );
}

function ConnectorDetail({ c, data, act, onClose }: any) {
  const [m, setM] = useState({ entity: "product", external_value: "", internal_value: "" });
  const jobs = data.jobs.filter((j: any) => j.connector_id === c.id);
  const logs = data.logs.filter((l: any) => l.connector_id === c.id);
  const maps = data.mappings.filter((x: any) => x.connector_id === c.id);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{c.name} <span className="font-mono text-xs text-muted-foreground">{c.provider}</span></CardTitle>
        <div className="flex gap-2">
          {c.status !== "active" && <Button size="sm" onClick={() => act("set_status", c.id, { status: "active" })}>Activer</Button>}
          {c.status === "active" && <Button size="sm" variant="outline" onClick={() => act("set_status", c.id, { status: "paused" })}>Suspendre</Button>}
          {c.status !== "disabled" && <Button size="sm" variant="outline" onClick={() => act("set_status", c.id, { status: "disabled" })}>Désactiver</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Mapping de données</h4>
          <div className="flex gap-1">
            <Select value={m.entity} onValueChange={(entity) => setM({ ...m, entity })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{["product", "station", "tank", "payment_method", "client", "unit", "status", "field"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select>
            <Input placeholder="Externe" value={m.external_value} onChange={(e) => setM({ ...m, external_value: e.target.value })} />
            <Input placeholder="LUMATEK" value={m.internal_value} onChange={(e) => setM({ ...m, internal_value: e.target.value })} />
            <Button size="icon" onClick={async () => { if (await act("set_mapping", c.id, m)) setM({ ...m, external_value: "", internal_value: "" }); }}><Plus className="h-4 w-4" /></Button>
          </div>
          {maps.map((x: any) => (
            <div key={x.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
              <span><Badge variant="outline">{x.entity}</Badge> {x.external_value} → <b>{x.internal_value}</b></span>
              <Button size="icon" variant="ghost" onClick={() => act("delete_mapping", c.id, { mapping_id: x.id })}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          {!maps.length && <p className="text-xs text-muted-foreground">Aucun mapping.</p>}
          <ScheduleSection c={c} act={act} />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Jobs de synchronisation</h4>
          {jobs.slice(0, 15).map((j: any) => (
            <div key={j.id} className="rounded border border-border p-2 text-xs">
              <div className="flex items-center justify-between"><span><Badge variant="outline">{j.job_type}</Badge> {j.status} · {j.attempts}/{j.max_attempts}</span>
                {["failed", "dead"].includes(j.status) && <Button size="sm" variant="ghost" onClick={() => act("retry", c.id, { job_id: j.id })}><RotateCw className="mr-1 h-3 w-3" />Relancer</Button>}</div>
              <div className="font-mono text-muted-foreground">{j.idempotency_key} · {fmt(j.created_at)}</div>
              {j.last_error && <div className="text-destructive">{j.last_error}</div>}
              {j.status === "pending" && j.attempts > 0 && <div className="text-muted-foreground">Prochaine tentative : {fmt(j.next_attempt_at)}</div>}
            </div>
          ))}
          {!jobs.length && <p className="text-xs text-muted-foreground">Aucun job.</p>}
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Journal</h4>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {logs.map((l: any) => (
              <div key={l.id} className={`text-xs ${l.level === "error" ? "text-destructive" : ""}`}>
                <span className="text-muted-foreground">{fmt(l.created_at)}</span> {l.message}
                {l.details?.error && <span> — {l.details.error}</span>}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
