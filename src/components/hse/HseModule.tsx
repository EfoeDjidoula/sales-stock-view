import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { toast } from "sonner";
import { ShieldCheck, Plus, Loader2, History, Paperclip, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { complianceScore, scoreTone, COMPLIANCE_ALERT_THRESHOLD } from "@/lib/hse";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EVENT_KIND: Record<string, string> = { incident: "Incident", accident: "Accident", near_miss: "Quasi-accident", fire_drill: "Exercice incendie" };
const SEVERITY: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée", critical: "Critique" };
const NC_SEV: Record<string, string> = { minor: "Mineure", major: "Majeure", critical: "Critique" };
const NC_STATUS: Record<string, string> = { open: "À traiter", in_progress: "En cours", pending_validation: "Clôture à valider", closed: "Close" };
const INSP_STATUS: Record<string, string> = { draft: "Brouillon", submitted: "Soumise", validated: "Validée", rejected: "Rejetée" };
const SAFETY_KIND: Record<string, string> = { extinguisher: "Extincteur", ppe: "EPI", spill_kit: "Kit anti-pollution", other: "Autre" };
const TONE_CLS: Record<string, string> = { green: "border-success/40 text-success", orange: "border-warning/40 text-warning", red: "border-destructive/50 text-destructive" };
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

const HseModule = () => {
  const { tenantId, countryId, scopeQuery, scopeRow } = useScope();
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<Record<string, Row[]>>({});
  const [stationF, setStationF] = useState("all");
  const [dlg, setDlg] = useState<{ type: string; row: Row } | null>(null);
  const [inspection, setInspection] = useState<Row | null>(null);
  const [answers, setAnswers] = useState<Record<string, Row>>({});
  const [history, setHistory] = useState<{ title: string; rows: Row[]; files: Row[] } | null>(null);
  const [scoreDetail, setScoreDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    setLoading(true);
    const tables = ["stations", "hse_checklists", "hse_checklist_items", "hse_inspections", "hse_events", "hse_safety_items", "hse_nonconformities"];
    const res = await Promise.all(tables.map((t) => scopeQuery(db.from(t).select("*"))));
    const out: Record<string, Row[]> = {};
    tables.forEach((t, i) => (out[t] = res[i].data ?? []));
    out.stations.sort((a, b) => a.name.localeCompare(b.name));
    out.hse_checklist_items.sort((a, b) => a.position - b.position);
    out.hse_inspections.sort((a, b) => b.inspected_on.localeCompare(a.inspected_on));
    out.hse_events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    setD(out); setLoading(false);
  }, [tenantId, countryId, scopeQuery]);
  useEffect(() => { load(); }, [load]);

  const st = (id: string) => d.stations?.find((s) => s.id === id)?.name ?? "—";
  const byStation = <T extends Row>(rows: T[] = []) => rows.filter((r) => stationF === "all" || r.station_id === stationF);
  const ncs = byStation(d.hse_nonconformities);

  const scores = useMemo(() => (d.stations ?? []).filter((s) => s.status !== "inactive").map((s) => {
    const insp = (d.hse_inspections ?? []).find((i) => i.station_id === s.id && i.status === "validated");
    const nc = (d.hse_nonconformities ?? []).filter((n) => n.station_id === s.id && n.status !== "closed");
    const items = (d.hse_safety_items ?? []).filter((x) => x.station_id === s.id && x.status !== "retired");
    const t = today();
    const expired = items.filter((x) => (x.expires_on && x.expires_on < t) || (x.next_check_on && x.next_check_on < t) || x.status === "to_replace").length;
    const drill = (d.hse_events ?? []).find((e) => e.station_id === s.id && e.kind === "fire_drill");
    const r = complianceScore({
      lastInspectionScore: insp ? Number(insp.score) : null,
      openCriticalNc: nc.filter((n) => n.severity === "critical").length,
      safetyItemsTotal: items.length, safetyItemsExpired: expired,
      openActions: nc.length, overdueActions: nc.filter((n) => n.due_on && n.due_on < t).length,
      daysSinceFireDrill: drill ? daysBetween(drill.occurred_at.slice(0, 10), t) : null,
    });
    return { station: s, ...r };
  }).sort((a, b) => a.score - b.score), [d]);

  const run = async (p: Promise<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p;
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return true;
  };
  const action = (entity: string, id: string, act: string, comment?: string | null, data: Row = {}) =>
    run(db.rpc("hse_action", { _entity: entity, _id: id, _action: act, _comment: comment ?? null, _data: data }), "Action enregistrée");

  const upload = async (entity: string, entityId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error("Fichier de 20 Mo maximum"); return null; }
    const path = `${tenantId}/hse/${entity}/${entityId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) { toast.error(error.message); return null; }
    await db.from("hse_attachments").insert(scopeRow({ entity_type: entity, entity_id: entityId, file_path: path, file_name: file.name }));
    return path;
  };
  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("support-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const openHistory = async (title: string, id: string) => {
    const [h, f] = await Promise.all([
      db.from("hse_history").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
      db.from("hse_attachments").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
    ]);
    setHistory({ title, rows: h.data ?? [], files: f.data ?? [] });
  };

  // ---------- Saving dialogs ----------
  const save = async () => {
    const { type, row: f } = dlg!;
    const file: File | undefined = f._file;
    let ok = false; let id = f.id;
    const exec = async (table: string, row: Row) => {
      const q = f.id ? db.from(table).update(row).eq("id", f.id).select("id").single() : db.from(table).insert(scopeRow(row)).select("id").single();
      const { data, error } = await q;
      if (error) { toast.error(error.message); return false; }
      id = data.id; return true;
    };
    if (type === "event") {
      if (!f.station_id || !f.title) return toast.error("Station et intitulé obligatoires");
      ok = await exec("hse_events", { station_id: f.station_id, kind: f.kind, occurred_at: f.occurred_at ? new Date(f.occurred_at).toISOString() : new Date().toISOString(), severity: f.severity, title: f.title, description: f.description || null, injuries: Number(f.injuries || 0), immediate_actions: f.immediate_actions || null, responsible: f.responsible || null, status: f.status ?? "open" });
    } else if (type === "safety") {
      if (!f.station_id || !f.label) return toast.error("Station et désignation obligatoires");
      ok = await exec("hse_safety_items", { station_id: f.station_id, kind: f.kind, label: f.label, reference: f.reference || null, quantity: Number(f.quantity ?? 1), last_check_on: f.last_check_on || null, next_check_on: f.next_check_on || null, expires_on: f.expires_on || null, status: f.status ?? "ok", notes: f.notes || null });
    } else if (type === "nc") {
      if (!f.station_id || !f.title) return toast.error("Station et intitulé obligatoires");
      const row: Row = { station_id: f.station_id, title: f.title, description: f.description || null, corrective_action: f.corrective_action || null, responsible: f.responsible || null, due_on: f.due_on || null, event_id: f.event_id || null };
      if (!f.id) row.severity = f.severity;
      ok = await exec("hse_nonconformities", row);
    } else if (type === "checklist") {
      if (!f.name) return toast.error("Nom obligatoire");
      ok = await exec("hse_checklists", { name: f.name, category: f.category || "general", is_active: f.is_active ?? true });
    } else if (type === "item") {
      if (!f.label) return toast.error("Libellé obligatoire");
      ok = await exec("hse_checklist_items", { checklist_id: f.checklist_id, label: f.label, weight: Number(f.weight || 1), is_critical: !!f.is_critical, position: Number(f.position || 0), is_active: f.is_active ?? true });
    } else if (type === "inspection") {
      if (!f.station_id || !f.checklist_id) return toast.error("Station et checklist obligatoires");
      ok = await exec("hse_inspections", { station_id: f.station_id, checklist_id: f.checklist_id, inspected_on: f.inspected_on || today(), inspector: f.inspector || null, notes: f.notes || null });
    } else if (type === "closure") {
      if (!f.proof?.trim()) return toast.error("Preuve de clôture obligatoire");
      const path = file ? await upload("nonconformity", f.id, file) : null;
      ok = await action("nonconformity", f.id, "submit_closure", null, { proof: f.proof, attachment: path });
      if (ok) setDlg(null);
      return;
    } else if (type === "comment") {
      if (!f.comment?.trim()) return toast.error("Motif obligatoire");
      ok = await action(f.entity, f.id, f.act, f.comment);
      if (ok) setDlg(null);
      return;
    }
    if (ok && file && id) await upload(type === "event" ? "event" : type === "safety" ? "safety_item" : type === "nc" ? "nonconformity" : "inspection", id, file);
    if (ok) { toast.success("Enregistré"); setDlg(null); load(); }
  };

  // ---------- Inspection run ----------
  const openInspection = async (i: Row) => {
    setInspection(i);
    const { data } = await db.from("hse_inspection_answers").select("*").eq("inspection_id", i.id);
    setAnswers(Object.fromEntries((data ?? []).map((a: Row) => [a.item_id, a])));
  };
  const setAnswer = async (itemId: string, patch: Row) => {
    const cur = answers[itemId] ?? {};
    const next = { ...cur, ...patch };
    setAnswers({ ...answers, [itemId]: next });
    if (!next.result) return;
    const { error } = await db.from("hse_inspection_answers").upsert(scopeRow({ inspection_id: inspection!.id, item_id: itemId, result: next.result, comment: next.comment || null }), { onConflict: "inspection_id,item_id" });
    if (error) toast.error(error.message);
  };
  const inspItems = inspection ? (d.hse_checklist_items ?? []).filter((x) => x.checklist_id === inspection.checklist_id && x.is_active) : [];
  const liveScore = (() => {
    let ok = 0, tot = 0;
    inspItems.forEach((it) => { const r = answers[it.id]?.result; if (r && r !== "na") { tot += Number(it.weight); if (r === "ok") ok += Number(it.weight); } });
    return tot ? Math.round((1000 * ok) / tot) / 10 : null;
  })();

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const f = dlg?.row ?? {};
  const setF = (k: string, v: unknown) => setDlg((x) => x && { ...x, row: { ...x.row, [k]: v } });
  const inp = (k: string, label: string, type = "text") => (
    <div className="space-y-1"><Label>{label}</Label><Input type={type} value={f[k] ?? ""} onChange={(e) => setF(k, e.target.value)} /></div>
  );
  const sel = (k: string, label: string, opts: Record<string, string>) => (
    <div className="space-y-1"><Label>{label}</Label><Select value={f[k] ?? ""} onValueChange={(v) => setF(k, v)}><SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
      <SelectContent>{Object.entries(opts).map(([a, b]) => <SelectItem key={a} value={a}>{b}</SelectItem>)}</SelectContent></Select></div>
  );
  const stationOpts = Object.fromEntries((d.stations ?? []).map((s) => [s.id, s.name]));
  const fileInput = (
    <div className="space-y-1"><Label>Pièce jointe (≤ 20 Mo)</Label><Input type="file" onChange={(e) => setF("_file", e.target.files?.[0])} /></div>
  );
  const critOpen = (d.hse_nonconformities ?? []).filter((n) => n.severity === "critical" && n.status !== "closed");
  const avg = scores.length ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length) : 0;
  const t0 = today();
  const expiredItems = (d.hse_safety_items ?? []).filter((x) => x.status !== "retired" && ((x.expires_on && x.expires_on < t0) || (x.next_check_on && x.next_check_on < t0)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />HSE & Conformité</h2>
        <Select value={stationF} onValueChange={setStationF}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Toutes les stations</SelectItem>{(d.stations ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Compliance Score moyen", `${avg} / 100`], ["NC critiques ouvertes", String(critOpen.length)],
          ["Événements (30 j)", String((d.hse_events ?? []).filter((e) => daysBetween(e.occurred_at.slice(0, 10), t0) <= 30).length)],
          ["Équipements sécurité à revoir", String(expiredItems.length)]].map(([l, v]) => (
          <Card key={l} className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></CardContent></Card>))}
      </div>

      <Tabs defaultValue="scores">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="scores">Compliance Score</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="events">Incidents & exercices</TabsTrigger>
          <TabsTrigger value="nc">Non-conformités & actions ({ncs.filter((n) => n.status !== "closed").length})</TabsTrigger>
          <TabsTrigger value="safety">Extincteurs & EPI</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
        </TabsList>

        <TabsContent value="scores">
          <Table><TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Score</TableHead>{scores[0]?.factors.map((x) => <TableHead key={x.key}>{x.label} ({x.weight} %)</TableHead>)}</TableRow></TableHeader>
            <TableBody>{scores.filter((s) => stationF === "all" || s.station.id === stationF).map((s) => (
              <TableRow key={s.station.id} className="cursor-pointer" onClick={() => setScoreDetail(s)}>
                <TableCell className="font-medium">{s.station.name}</TableCell>
                <TableCell><Badge variant="outline" className={TONE_CLS[scoreTone(s.score)]}>{s.score}</Badge></TableCell>
                {s.factors.map((x) => <TableCell key={x.key} title={x.detail}>{Math.round(x.value)} %</TableCell>)}
              </TableRow>))}</TableBody></Table>
          <p className="text-xs text-muted-foreground mt-2">Cliquez sur une station pour le détail. Alerte sous {COMPLIANCE_ALERT_THRESHOLD}/100.</p>
        </TabsContent>

        <TabsContent value="inspections" className="space-y-3">
          <Button disabled={!d.hse_checklists?.length} onClick={() => setDlg({ type: "inspection", row: { inspected_on: today(), station_id: stationF !== "all" ? stationF : undefined } })}><Plus className="h-4 w-4 mr-1" />Inspection</Button>
          {!d.hse_checklists?.length && <p className="text-sm text-muted-foreground">Créez d'abord une checklist dans l'onglet Checklists.</p>}
          <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Station</TableHead><TableHead>Checklist</TableHead><TableHead>Inspecteur</TableHead><TableHead>Score</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{byStation(d.hse_inspections).map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.inspected_on}</TableCell><TableCell>{st(i.station_id)}</TableCell>
                <TableCell>{d.hse_checklists.find((c) => c.id === i.checklist_id)?.name}</TableCell>
                <TableCell>{i.inspector ?? "—"}</TableCell><TableCell>{i.score != null ? `${i.score} %` : "—"}</TableCell>
                <TableCell><Badge variant={i.status === "validated" ? "default" : "secondary"}>{INSP_STATUS[i.status]}</Badge></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => openInspection(i)}>{i.status === "draft" ? "Remplir" : "Voir"}</Button>
                  {i.status === "submitted" && <>
                    <Button size="sm" variant="ghost" onClick={() => action("inspection", i.id, "validate")}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "comment", row: { entity: "inspection", id: i.id, act: "reject" } })}>Rejeter</Button></>}
                  <Button size="icon" variant="ghost" onClick={() => openHistory(`Inspection ${i.inspected_on}`, i.id)}><History className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>))}</TableBody></Table>
          <p className="text-xs text-muted-foreground">À la validation, chaque point non conforme crée une non-conformité (critique : échéance 7 j, sinon 30 j).</p>
        </TabsContent>

        <TabsContent value="events" className="space-y-3">
          <Button onClick={() => setDlg({ type: "event", row: { kind: "incident", severity: "low", station_id: stationF !== "all" ? stationF : undefined } })}><Plus className="h-4 w-4 mr-1" />Déclarer</Button>
          <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Station</TableHead><TableHead>Intitulé</TableHead><TableHead>Gravité</TableHead><TableHead>Blessés</TableHead><TableHead>Responsable</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{byStation(d.hse_events).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.occurred_at.slice(0, 10)}</TableCell><TableCell>{EVENT_KIND[e.kind]}</TableCell><TableCell>{st(e.station_id)}</TableCell>
                <TableCell>{e.title}</TableCell><TableCell><Badge variant={e.severity === "critical" ? "destructive" : "outline"}>{SEVERITY[e.severity]}</Badge></TableCell>
                <TableCell>{e.injuries}</TableCell><TableCell>{e.responsible ?? "—"}</TableCell><TableCell>{e.status === "open" ? "Ouvert" : "Clos"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "event", row: { ...e, occurred_at: e.occurred_at.slice(0, 16) } })}>Modifier</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "nc", row: { station_id: e.station_id, event_id: e.id, severity: e.severity === "critical" ? "critical" : "major", title: e.title } })}>NC</Button>
                  <Button size="icon" variant="ghost" onClick={() => openHistory(e.title, e.id)}><History className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>))}</TableBody></Table>
        </TabsContent>

        <TabsContent value="nc" className="space-y-3">
          <Button onClick={() => setDlg({ type: "nc", row: { severity: "major", station_id: stationF !== "all" ? stationF : undefined } })}><Plus className="h-4 w-4 mr-1" />Non-conformité</Button>
          <Table><TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Intitulé</TableHead><TableHead>Sévérité</TableHead><TableHead>Action corrective</TableHead><TableHead>Responsable</TableHead><TableHead>Échéance</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{ncs.sort((a, b) => (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0)).map((n) => {
              const late = n.status !== "closed" && n.due_on && n.due_on < t0;
              return (
              <TableRow key={n.id} className={n.status === "closed" ? "opacity-60" : ""}>
                <TableCell>{st(n.station_id)}</TableCell><TableCell className="font-medium">{n.title}</TableCell>
                <TableCell><Badge variant={n.severity === "critical" ? "destructive" : "outline"}>{NC_SEV[n.severity]}</Badge></TableCell>
                <TableCell className="max-w-48 truncate">{n.corrective_action ?? "—"}</TableCell><TableCell>{n.responsible ?? "—"}</TableCell>
                <TableCell className={late ? "text-destructive font-medium" : ""}>{n.due_on ?? "—"}{late && " (retard)"}</TableCell>
                <TableCell><Badge variant="secondary">{NC_STATUS[n.status]}</Badge></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {n.status !== "closed" && n.status !== "pending_validation" && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "nc", row: n })}>Modifier</Button>}
                  {n.status === "open" && <Button size="sm" variant="ghost" onClick={() => action("nonconformity", n.id, "start")}>Démarrer</Button>}
                  {["open", "in_progress"].includes(n.status) && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "closure", row: { id: n.id } })}>Clôturer</Button>}
                  {n.status === "pending_validation" && <>
                    <Button size="sm" variant="ghost" onClick={() => action("nonconformity", n.id, "validate_closure")}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "comment", row: { entity: "nonconformity", id: n.id, act: "reject_closure" } })}>Refuser</Button></>}
                  {n.status === "closed" && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "comment", row: { entity: "nonconformity", id: n.id, act: "reopen" } })}>Rouvrir</Button>}
                  <Button size="icon" variant="ghost" onClick={() => openHistory(n.title, n.id)}><History className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>); })}</TableBody></Table>
          <p className="text-xs text-muted-foreground">Clôture : preuve obligatoire puis validation. Une NC critique doit être validée par une autre personne que celle qui a soumis la preuve.</p>
        </TabsContent>

        <TabsContent value="safety" className="space-y-3">
          <Button onClick={() => setDlg({ type: "safety", row: { kind: "extinguisher", quantity: 1, status: "ok", station_id: stationF !== "all" ? stationF : undefined } })}><Plus className="h-4 w-4 mr-1" />Équipement</Button>
          <Table><TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Type</TableHead><TableHead>Désignation</TableHead><TableHead>Qté</TableHead><TableHead>Dernière vérif.</TableHead><TableHead>Prochaine vérif.</TableHead><TableHead>Péremption</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{byStation(d.hse_safety_items).map((x) => {
              const bad = (v?: string) => v && v < t0 ? "text-destructive font-medium" : "";
              return (
              <TableRow key={x.id} className={x.status === "retired" ? "opacity-50" : ""}>
                <TableCell>{st(x.station_id)}</TableCell><TableCell>{SAFETY_KIND[x.kind]}</TableCell><TableCell>{x.label}{x.reference ? ` · ${x.reference}` : ""}</TableCell>
                <TableCell>{x.quantity}</TableCell><TableCell>{x.last_check_on ?? "—"}</TableCell>
                <TableCell className={bad(x.next_check_on)}>{x.next_check_on ?? "—"}</TableCell><TableCell className={bad(x.expires_on)}>{x.expires_on ?? "—"}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => setDlg({ type: "safety", row: x })}>Modifier</Button></TableCell>
              </TableRow>); })}</TableBody></Table>
        </TabsContent>

        <TabsContent value="checklists" className="space-y-3">
          <Button onClick={() => setDlg({ type: "checklist", row: { is_active: true } })}><Plus className="h-4 w-4 mr-1" />Checklist</Button>
          {(d.hse_checklists ?? []).map((c) => (
            <Card key={c.id} className={!c.is_active ? "opacity-50" : ""}><CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-center"><p className="font-semibold">{c.name} <span className="text-xs text-muted-foreground">· {c.category}</span></p>
                <div><Button size="sm" variant="ghost" onClick={() => setDlg({ type: "checklist", row: c })}>Modifier</Button>
                  <Button size="sm" variant="outline" onClick={() => setDlg({ type: "item", row: { checklist_id: c.id, weight: 1, position: (d.hse_checklist_items.filter((i) => i.checklist_id === c.id).length + 1) } })}><Plus className="h-3 w-3 mr-1" />Point</Button></div></div>
              {d.hse_checklist_items.filter((i) => i.checklist_id === c.id).map((i) => (
                <div key={i.id} className={`flex justify-between text-sm border-b border-border/50 py-1 ${!i.is_active ? "opacity-50" : ""}`}>
                  <span>{i.position}. {i.label} {i.is_critical && <Badge variant="destructive" className="ml-1">Critique</Badge>}</span>
                  <span className="text-muted-foreground">poids {i.weight} <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "item", row: i })}>Modifier</Button></span>
                </div>))}
            </CardContent></Card>))}
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{{ event: "Événement HSE", safety: "Équipement de sécurité", nc: "Non-conformité", checklist: "Checklist", item: "Point de contrôle", inspection: "Nouvelle inspection", closure: "Preuve de clôture", comment: "Motif" }[dlg?.type ?? ""]}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {dlg?.type === "event" && <>{sel("station_id", "Station", stationOpts)}{sel("kind", "Type", EVENT_KIND)}{sel("severity", "Gravité", SEVERITY)}
              {inp("title", "Intitulé")}{inp("occurred_at", "Date et heure", "datetime-local")}
              <div className="space-y-1"><Label>Description</Label><Textarea value={f.description ?? ""} onChange={(e) => setF("description", e.target.value)} /></div>
              {inp("injuries", "Blessés", "number")}
              <div className="space-y-1"><Label>Mesures immédiates</Label><Textarea value={f.immediate_actions ?? ""} onChange={(e) => setF("immediate_actions", e.target.value)} /></div>
              {inp("responsible", "Responsable")}{f.id && sel("status", "Statut", { open: "Ouvert", closed: "Clos" })}{fileInput}</>}
            {dlg?.type === "safety" && <>{sel("station_id", "Station", stationOpts)}{sel("kind", "Type", SAFETY_KIND)}{inp("label", "Désignation (ex. Extincteur CO2 6 kg)")}{inp("reference", "N° / référence")}
              {inp("quantity", "Quantité", "number")}{inp("last_check_on", "Dernière vérification", "date")}{inp("next_check_on", "Prochaine vérification", "date")}{inp("expires_on", "Péremption / réépreuve", "date")}
              {sel("status", "État", { ok: "Conforme", to_replace: "À remplacer", retired: "Retiré" })}{fileInput}</>}
            {dlg?.type === "nc" && <>{sel("station_id", "Station", stationOpts)}{inp("title", "Intitulé")}{!f.id ? sel("severity", "Sévérité", NC_SEV) : <p className="text-sm">Sévérité : {NC_SEV[f.severity]}</p>}
              <div className="space-y-1"><Label>Description</Label><Textarea value={f.description ?? ""} onChange={(e) => setF("description", e.target.value)} /></div>
              <div className="space-y-1"><Label>Action corrective</Label><Textarea value={f.corrective_action ?? ""} onChange={(e) => setF("corrective_action", e.target.value)} /></div>
              {inp("responsible", "Responsable")}{inp("due_on", "Échéance", "date")}{fileInput}</>}
            {dlg?.type === "checklist" && <>{inp("name", "Nom")}{inp("category", "Catégorie (incendie, pistes, cuves…)")}
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.is_active ?? true} onCheckedChange={(v) => setF("is_active", !!v)} />Active</label></>}
            {dlg?.type === "item" && <>{inp("label", "Point de contrôle")}{inp("weight", "Poids", "number")}{inp("position", "Ordre", "number")}
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.is_critical} onCheckedChange={(v) => setF("is_critical", !!v)} />Point critique (NC critique si non conforme)</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.is_active ?? true} onCheckedChange={(v) => setF("is_active", !!v)} />Actif</label></>}
            {dlg?.type === "inspection" && <>{sel("station_id", "Station", stationOpts)}{sel("checklist_id", "Checklist", Object.fromEntries((d.hse_checklists ?? []).filter((c) => c.is_active).map((c) => [c.id, c.name])))}
              {inp("inspected_on", "Date", "date")}{inp("inspector", "Inspecteur")}{fileInput}</>}
            {dlg?.type === "closure" && <><div className="space-y-1"><Label>Preuve / description des travaux réalisés</Label><Textarea value={f.proof ?? ""} onChange={(e) => setF("proof", e.target.value)} /></div>{fileInput}</>}
            {dlg?.type === "comment" && <div className="space-y-1"><Label>Motif</Label><Textarea value={f.comment ?? ""} onChange={(e) => setF("comment", e.target.value)} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspection run */}
      <Dialog open={!!inspection} onOpenChange={(o) => { if (!o) { setInspection(null); load(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Inspection {inspection && st(inspection.station_id)} · {inspection?.inspected_on} — score {liveScore ?? "—"} %</DialogTitle></DialogHeader>
          <div className="space-y-2">{inspItems.map((it) => {
            const a = answers[it.id] ?? {}; const locked = inspection?.status !== "draft";
            return (
              <div key={it.id} className="rounded-md border p-2 space-y-1">
                <div className="flex justify-between items-center gap-2"><span className="text-sm">{it.label} {it.is_critical && <Badge variant="destructive">Critique</Badge>}</span>
                  <div className="flex gap-1">{(["ok", "nok", "na"] as const).map((r) => (
                    <Button key={r} size="sm" disabled={locked} variant={a.result === r ? (r === "nok" ? "destructive" : "default") : "outline"} onClick={() => setAnswer(it.id, { result: r })}>{{ ok: "Conforme", nok: "Non conforme", na: "N/A" }[r]}</Button>))}</div></div>
                {a.result === "nok" && <Input disabled={locked} placeholder="Constat" defaultValue={a.comment ?? ""} onBlur={(e) => setAnswer(it.id, { comment: e.target.value })} />}
              </div>); })}</div>
          <DialogFooter>{inspection?.status === "draft" && <Button onClick={async () => { if (await action("inspection", inspection.id, "submit")) setInspection(null); }}>Soumettre</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Historique · {history?.title}</DialogTitle></DialogHeader>
          {!!history?.files.length && <div className="space-y-1">{history.files.map((x) => <Button key={x.id} size="sm" variant="outline" className="mr-1" onClick={() => openFile(x.file_path)}><Paperclip className="h-3 w-3 mr-1" />{x.file_name}</Button>)}</div>}
          <div className="space-y-2 text-sm">{history?.rows.map((h) => (
            <div key={h.id} className="border-l-2 border-primary pl-2"><p className="font-medium">{h.action} <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</span></p>
              {h.comment && <p>{h.comment}</p>}{h.details?.proof && <p className="text-muted-foreground">Preuve : {h.details.proof}</p>}
              {h.details?.attachment && <Button size="sm" variant="link" className="p-0 h-auto" onClick={() => openFile(h.details.attachment)}>Pièce jointe</Button>}</div>))}
            {!history?.rows.length && <p className="text-muted-foreground">Aucun historique.</p>}</div>
        </DialogContent>
      </Dialog>

      {/* Score detail */}
      <Dialog open={!!scoreDetail} onOpenChange={(o) => !o && setScoreDetail(null)}>
        <DialogContent><DialogHeader><DialogTitle>Compliance Score · {scoreDetail?.station.name} : {scoreDetail?.score}/100</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">{scoreDetail?.factors.map((x: Row) => (
            <div key={x.key} className="flex justify-between gap-2 border-b border-border/50 pb-1"><div><p className="font-medium">{x.label}</p><p className="text-xs text-muted-foreground">{x.detail}</p></div>
              <span className="whitespace-nowrap">{Math.round(x.value)} % × {x.weight} = <b>{Math.round((x.value * x.weight) / 100)}</b></span></div>))}
            {scoreDetail && scoreDetail.score < COMPLIANCE_ALERT_THRESHOLD && <p className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" />Sous le seuil d'alerte</p>}
          </div></DialogContent>
      </Dialog>
    </div>
  );
};

export default HseModule;
