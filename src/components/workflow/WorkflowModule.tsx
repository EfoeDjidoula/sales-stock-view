import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { GitBranch, Plus, Loader2, History, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORKFLOW_MODULES, WORKFLOW_OPERATIONS, WORKFLOW_STATUS, operationLabel } from "@/lib/workflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (s?: string) => (s ? new Date(s).toLocaleString("fr-FR") : "—");
const num = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
const ACTION_LABEL: Record<string, string> = { create: "Création", submit: "Soumission", approve: "Approbation", reject: "Rejet", cancel: "Annulation", escalate: "Escalade", comment: "Commentaire" };

const WorkflowModule = () => {
  const { tenantId, countryId } = useScope();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can("workflows.manage");
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState<Record<string, Row[]>>({});
  const [decidable, setDecidable] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [comment, setComment] = useState("");
  const [newReq, setNewReq] = useState<Row | null>(null);
  const [def, setDef] = useState<Row | null>(null);
  const [deleg, setDeleg] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    setLoading(true);
    const [req, defs, steps, dels, roles, profs] = await Promise.all([
      db.from("workflow_requests").select("*").eq("tenant_id", tenantId).eq("country_id", countryId).order("created_at", { ascending: false }).limit(300),
      db.from("workflow_definitions").select("*").eq("tenant_id", tenantId).or(`country_id.is.null,country_id.eq.${countryId}`).order("name"),
      db.from("workflow_steps").select("*").eq("tenant_id", tenantId).order("step_order"),
      db.from("workflow_delegations").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      db.from("roles").select("code,name,tenant_id").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`).order("position"),
      db.from("profiles").select("user_id,full_name,is_active").eq("tenant_id", tenantId),
    ]);
    const [tanks, clients] = await Promise.all([
      db.from("tanks").select("id,name,stations!inner(name,tenant_id,country_id)").eq("stations.tenant_id", tenantId).eq("stations.country_id", countryId).not("product_id", "is", null),
      db.from("clients").select("id,name").eq("tenant_id", tenantId).eq("country_id", countryId).eq("is_active", true).order("name"),
    ]);
    const requests: Row[] = req.data ?? [];
    setD({ requests, defs: defs.data ?? [], steps: steps.data ?? [], dels: dels.data ?? [], roles: roles.data ?? [], profiles: profs.data ?? [], tanks: tanks.data ?? [], clients: clients.data ?? [] });
    const pending = requests.filter((r) => ["submitted", "escalated"].includes(r.status) && r.requested_by !== user?.id);
    const checks = await Promise.all(pending.map((r) => db.rpc("workflow_can_decide", { _id: r.id })));
    setDecidable(new Set(pending.filter((_, i) => checks[i].data === true).map((r) => r.id)));
    setLoading(false);
  }, [tenantId, countryId, user?.id]);
  useEffect(() => { load(); }, [load]);

  const roleName = (c?: string) => (c ? d.roles?.find((r) => r.code === c)?.name ?? c : "—");
  const person = (id?: string) => (id === "00000000-0000-0000-0000-000000000000" ? "Système" : id ? d.profiles?.find((p) => p.user_id === id)?.full_name ?? "Utilisateur" : "—");

  const run = async (p: Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await p;
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); await load(); return true;
  };

  const openDetail = async (r: Row) => {
    setDetail(r); setComment("");
    const { data } = await db.from("workflow_events").select("*").eq("request_id", r.id).order("created_at");
    setEvents(data ?? []);
  };
  const act = async (action: string) => {
    if (!detail) return;
    if (await run(db.rpc("workflow_action", { _id: detail.id, _action: action, _comment: comment || null }), "Action enregistrée")) {
      const { data } = await db.from("workflow_requests").select("*").eq("id", detail.id).single();
      if (data) openDetail(data);
    }
  };

  const toValidate = (d.requests ?? []).filter((r) => decidable.has(r.id));
  const mine = (d.requests ?? []).filter((r) => r.requested_by === user?.id);
  const overdue = (r: Row) => r.step_due_at && ["submitted", "escalated"].includes(r.status) && new Date(r.step_due_at) < new Date();

  const reqTable = (rows: Row[]) => (
    <Table>
      <TableHeader><TableRow><TableHead>Réf.</TableHead><TableHead>Objet</TableHead><TableHead>Opération</TableHead><TableHead className="text-right">Montant / volume</TableHead><TableHead>Étape</TableHead><TableHead>Statut</TableHead><TableHead>Créée</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucune demande</TableCell></TableRow>}
        {rows.map((r) => (
          <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
            <TableCell className="font-mono text-xs">{r.reference}</TableCell>
            <TableCell>{r.title}</TableCell>
            <TableCell>{operationLabel(r.operation_type)}</TableCell>
            <TableCell className="text-right">{r.amount != null ? `${num(r.amount)} F` : ""}{r.volume != null ? ` ${num(r.volume)} L` : ""}</TableCell>
            <TableCell>{r.current_role_code ? <span>{r.current_step}/{(r.steps ?? []).length} · {roleName(r.current_role_code)}{overdue(r) && <Clock className="inline h-3 w-3 ml-1 text-destructive" />}</span> : "—"}</TableCell>
            <TableCell><Badge variant="outline" className={WORKFLOW_STATUS[r.status]?.cls}>{WORKFLOW_STATUS[r.status]?.label ?? r.status}</Badge></TableCell>
            <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const saveDef = async () => {
    if (!def) return;
    const { steps, id, ...data } = def;
    if (await run(db.rpc("workflow_save_definition", { _id: id ?? null, _data: { ...data, tenant_id: tenantId }, _steps: steps }), "Circuit enregistré")) setDef(null);
  };
  const createReq = async (submit: boolean) => {
    if (!newReq) return;
    setBusy(true);
    const { data: id, error } = await db.rpc("workflow_create_request", {
      _tenant: tenantId, _country: countryId, _module: newReq.module, _operation: newReq.operation_type, _title: newReq.title,
      _data: {
        description: newReq.description, amount: newReq.amount, volume: newReq.volume,
        payload: newReq.operation_type === "stock_adjustment" ? { tank_id: newReq.tank_id, direction: newReq.direction }
          : newReq.operation_type === "credit_limit_increase" ? { client_id: newReq.client_id } : {},
        entity_type: newReq.operation_type === "stock_adjustment" ? "tank" : newReq.operation_type === "credit_limit_increase" ? "client" : "",
        entity_id: newReq.tank_id ?? newReq.client_id ?? "",
      },
    });
    if (error) { setBusy(false); toast.error(error.message); return; }
    if (submit) {
      const s = await db.rpc("workflow_action", { _id: id, _action: "submit", _comment: null });
      if (s.error) toast.error(`Brouillon créé, mais soumission impossible : ${s.error.message}`); else toast.success("Demande soumise");
    } else toast.success("Brouillon enregistré");
    setBusy(false); setNewReq(null); load();
  };

  const kpi = useMemo(() => {
    const r = d.requests ?? [];
    return [
      { l: "À valider par moi", v: toValidate.length },
      { l: "En cours", v: r.filter((x) => ["submitted", "escalated"].includes(x.status)).length },
      { l: "En retard (SLA)", v: r.filter(overdue).length },
      { l: "Approuvées", v: r.filter((x) => x.status === "approved").length },
      { l: "Rejetées", v: r.filter((x) => x.status === "rejected").length },
    ];
  }, [d.requests, toValidate.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!countryId) return <p className="text-muted-foreground">Sélectionnez un pays.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2"><GitBranch className="h-5 w-5 text-primary" />Workflows & approbations</h2>
        <Button onClick={() => setNewReq({ module: "stock", operation_type: "stock_adjustment", title: "" })}><Plus className="h-4 w-4 mr-1" />Nouvelle demande</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpi.map((k) => <Card key={k.l} className="glass-card"><CardContent className="p-3"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-2xl font-semibold">{loading ? "…" : k.v}</p></CardContent></Card>)}
      </div>

      <Tabs defaultValue="todo">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="todo">À valider ({toValidate.length})</TabsTrigger>
          <TabsTrigger value="mine">Mes demandes</TabsTrigger>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="circuits">Circuits</TabsTrigger>
          <TabsTrigger value="deleg">Délégations</TabsTrigger>
        </TabsList>
        <TabsContent value="todo"><Card className="glass-card"><CardContent className="p-0">{loading ? <Loader2 className="m-6 animate-spin" /> : reqTable(toValidate)}</CardContent></Card></TabsContent>
        <TabsContent value="mine"><Card className="glass-card"><CardContent className="p-0">{reqTable(mine)}</CardContent></Card></TabsContent>
        <TabsContent value="all"><Card className="glass-card"><CardContent className="p-0">{reqTable(d.requests ?? [])}</CardContent></Card></TabsContent>

        <TabsContent value="circuits" className="space-y-3">
          {canManage && <Button variant="outline" onClick={() => setDef({ name: "", module: "stock", operation_type: "stock_adjustment", country_id: countryId, is_active: true, steps: [{ label: "", role_code: "gerant", sla_hours: 24 }] })}><Plus className="h-4 w-4 mr-1" />Nouveau circuit</Button>}
          {(d.defs ?? []).length === 0 && <p className="text-muted-foreground text-sm">Aucun circuit configuré. Sans circuit correspondant, une demande ne peut pas être soumise.</p>}
          {(d.defs ?? []).map((x) => {
            const st = (d.steps ?? []).filter((s) => s.definition_id === x.id);
            return (
              <Card key={x.id} className="glass-card"><CardContent className="p-4 space-y-2">
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">{x.name} {!x.is_active && <Badge variant="outline">Inactif</Badge>}</p>
                    <p className="text-xs text-muted-foreground">{WORKFLOW_MODULES[x.module] ?? x.module} · {operationLabel(x.operation_type)} · {x.country_id ? "Ce pays" : "Tous pays"}
                      {x.min_amount != null || x.max_amount != null ? ` · Montant ${num(x.min_amount)} → ${num(x.max_amount)} F` : ""}
                      {x.min_volume != null || x.max_volume != null ? ` · Volume ${num(x.min_volume)} → ${num(x.max_volume)} L` : ""}
                      {x.requester_role_code ? ` · Demandeur : ${roleName(x.requester_role_code)}` : ""}</p>
                  </div>
                  {canManage && <Button size="sm" variant="ghost" onClick={() => setDef({ ...x, steps: st.map((s) => ({ label: s.label, role_code: s.role_code, sla_hours: s.sla_hours, escalation_role_code: s.escalation_role_code })) })}>Modifier</Button>}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  {st.map((s, i) => <span key={s.id} className="flex items-center gap-1">{i > 0 && <span className="text-muted-foreground">→</span>}<Badge variant="secondary">{s.step_order}. {s.label} ({roleName(s.role_code)}){s.sla_hours ? ` · ${s.sla_hours} h` : ""}</Badge></span>)}
                </div>
              </CardContent></Card>
            );
          })}
        </TabsContent>

        <TabsContent value="deleg" className="space-y-3">
          <Button variant="outline" onClick={() => { const n = new Date(); setDeleg({ delegate_id: "", module: "", starts_at: n.toISOString().slice(0, 16), ends_at: new Date(n.getTime() + 7 * 864e5).toISOString().slice(0, 16), reason: "" }); }}><Plus className="h-4 w-4 mr-1" />Déléguer mes approbations</Button>
          <Card className="glass-card"><CardContent className="p-0"><Table>
            <TableHeader><TableRow><TableHead>Délégant</TableHead><TableHead>Délégataire</TableHead><TableHead>Module</TableHead><TableHead>Période</TableHead><TableHead>Motif</TableHead><TableHead>État</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(d.dels ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucune délégation</TableCell></TableRow>}
              {(d.dels ?? []).map((x) => {
                const active = !x.revoked_at && new Date(x.starts_at) <= new Date() && new Date(x.ends_at) >= new Date();
                return (
                  <TableRow key={x.id}>
                    <TableCell>{person(x.delegator_id)}</TableCell><TableCell>{person(x.delegate_id)}</TableCell>
                    <TableCell>{x.module ? WORKFLOW_MODULES[x.module] ?? x.module : "Tous"}</TableCell>
                    <TableCell className="text-xs">{fmt(x.starts_at)} → {fmt(x.ends_at)}</TableCell>
                    <TableCell className="text-xs">{x.reason}</TableCell>
                    <TableCell><Badge variant="outline">{x.revoked_at ? "Révoquée" : active ? "Active" : new Date(x.ends_at) < new Date() ? "Expirée" : "Programmée"}</Badge></TableCell>
                    <TableCell>{!x.revoked_at && (x.delegator_id === user?.id || canManage) && <Button size="icon" variant="ghost" disabled={busy} onClick={() => run(db.rpc("workflow_revoke_delegation", { _id: x.id }), "Délégation révoquée")}><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Détail d'une demande */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && <>
            <DialogHeader><DialogTitle>{detail.reference} — {detail.title}</DialogTitle></DialogHeader>
            <div className="text-sm space-y-1">
              <p><Badge variant="outline" className={WORKFLOW_STATUS[detail.status]?.cls}>{WORKFLOW_STATUS[detail.status]?.label}</Badge> · {WORKFLOW_MODULES[detail.module] ?? detail.module} · {operationLabel(detail.operation_type)}</p>
              <p>Demandeur : {person(detail.requested_by)} · Montant : {num(detail.amount)} F · Volume : {num(detail.volume)} L</p>
              {detail.description && <p className="text-muted-foreground whitespace-pre-wrap">{detail.description}</p>}
              {detail.step_due_at && <p className={overdue(detail) ? "text-destructive" : "text-muted-foreground"}>Échéance de l'étape : {fmt(detail.step_due_at)}</p>}
              {detail.executed_at && <p className="text-primary">Opération exécutée le {fmt(detail.executed_at)} : {detail.execution_result?.kind === "stock_movement"
                ? `${detail.execution_result.direction === "in" ? "entrée" : "sortie"} de ${num(detail.execution_result.quantity)} L enregistrée au stock`
                : `plafond B2B passé de ${num(detail.execution_result?.previous_limit)} F à ${num(detail.execution_result?.new_limit)} F`}</p>}
            </div>
            <div className="flex flex-wrap gap-1">
              {(detail.steps ?? []).map((s: Row) => {
                const done = detail.status === "approved" || s.order < detail.current_step;
                const cur = s.order === detail.current_step && ["submitted", "escalated"].includes(detail.status);
                return <Badge key={s.order} variant={cur ? "default" : "outline"} className={done ? "border-success/50 text-success" : ""}>{s.order}. {s.label} ({roleName(s.role_code)})</Badge>;
              })}
              {detail.status === "escalated" && <Badge variant="destructive">Escaladé → {roleName(detail.current_role_code)}</Badge>}
            </div>
            <div>
              <p className="font-medium flex items-center gap-1 mb-1"><History className="h-4 w-4" />Historique</p>
              <ul className="space-y-1 text-sm border-l pl-3">
                {events.map((e) => <li key={e.id}><span className="text-xs text-muted-foreground">{fmt(e.created_at)}</span> · <b>{ACTION_LABEL[e.action] ?? e.action}</b> par {person(e.actor_id)}{e.on_behalf_of ? ` (pour ${person(e.on_behalf_of)})` : ""}{e.step_order ? ` · étape ${e.step_order}` : ""}{e.comment ? ` — « ${e.comment} »` : ""}</li>)}
              </ul>
            </div>
            <Textarea placeholder="Commentaire (obligatoire pour rejet et escalade)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="ghost" disabled={busy || !comment.trim()} onClick={() => act("comment")}>Commenter</Button>
              {detail.requested_by === user?.id && detail.status === "draft" && <Button disabled={busy} onClick={() => act("submit")}>Soumettre</Button>}
              {detail.requested_by === user?.id && ["draft", "submitted", "escalated"].includes(detail.status) && <Button variant="outline" disabled={busy} onClick={() => act("cancel")}>Annuler la demande</Button>}
              {decidable.has(detail.id) && <>
                {detail.status !== "escalated" && detail.steps?.[detail.current_step - 1]?.escalation_role_code && <Button variant="outline" disabled={busy || !comment.trim()} onClick={() => act("escalate")}>Escalader</Button>}
                <Button variant="destructive" disabled={busy || !comment.trim()} onClick={() => act("reject")}>Rejeter</Button>
                <Button disabled={busy} onClick={() => act("approve")}>Approuver</Button>
              </>}
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>

      {/* Nouvelle demande */}
      <Dialog open={!!newReq} onOpenChange={(o) => !o && setNewReq(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle demande d'approbation</DialogTitle></DialogHeader>
          {newReq && <div className="space-y-3">
            <OpPicker value={newReq} onChange={setNewReq} />
            <div><Label>Objet</Label><Input value={newReq.title} onChange={(e) => setNewReq({ ...newReq, title: e.target.value })} /></div>
            {newReq.operation_type === "stock_adjustment" && <div className="grid grid-cols-2 gap-2">
              <div><Label>Cuve à ajuster</Label><Select value={newReq.tank_id ?? ""} onValueChange={(v) => setNewReq({ ...newReq, tank_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{(d.tanks ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.stations?.name} — {t.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Sens</Label><Select value={newReq.direction ?? ""} onValueChange={(v) => setNewReq({ ...newReq, direction: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent><SelectItem value="in">Entrée (+)</SelectItem><SelectItem value="out">Sortie (−)</SelectItem></SelectContent></Select></div>
            </div>}
            {newReq.operation_type === "credit_limit_increase" && <div><Label>Client B2B</Label><Select value={newReq.client_id ?? ""} onValueChange={(v) => setNewReq({ ...newReq, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{(d.clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{newReq.operation_type === "credit_limit_increase" ? "Nouveau plafond (F)" : "Montant (F)"}</Label><Input type="number" min={0} value={newReq.amount ?? ""} onChange={(e) => setNewReq({ ...newReq, amount: e.target.value })} /></div>
              <div><Label>{newReq.operation_type === "stock_adjustment" ? "Volume à ajuster (L)" : "Volume (L)"}</Label><Input type="number" min={0} value={newReq.volume ?? ""} onChange={(e) => setNewReq({ ...newReq, volume: e.target.value })} /></div>
            </div>
            <div><Label>Justification</Label><Textarea value={newReq.description ?? ""} onChange={(e) => setNewReq({ ...newReq, description: e.target.value })} /></div>
          </div>}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => createReq(false)}>Brouillon</Button><Button disabled={busy || !newReq?.title} onClick={() => createReq(true)}>Soumettre</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Circuit */}
      <Dialog open={!!def} onOpenChange={(o) => !o && setDef(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{def?.id ? "Modifier le circuit" : "Nouveau circuit"}</DialogTitle></DialogHeader>
          {def && <div className="space-y-3">
            <div><Label>Nom</Label><Input value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} /></div>
            <OpPicker value={def} onChange={setDef} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[["min_amount", "Montant min (F)"], ["max_amount", "Montant max (F)"], ["min_volume", "Volume min (L)"], ["max_volume", "Volume max (L)"]].map(([k, l]) =>
                <div key={k}><Label className="text-xs">{l}</Label><Input type="number" min={0} value={def[k] ?? ""} onChange={(e) => setDef({ ...def, [k]: e.target.value })} /></div>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Portée</Label><Select value={def.country_id ? "country" : "all"} onValueChange={(v) => setDef({ ...def, country_id: v === "country" ? countryId : null })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="country">Pays actif</SelectItem><SelectItem value="all">Tous les pays de la société</SelectItem></SelectContent></Select></div>
              <div><Label>Rôle demandeur</Label><RolePicker roles={d.roles ?? []} value={def.requester_role_code ?? ""} onChange={(v) => setDef({ ...def, requester_role_code: v })} allowAny /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={def.is_active} onCheckedChange={(v) => setDef({ ...def, is_active: v })} /><Label>Actif</Label></div>
            <div className="space-y-2">
              <Label>Étapes d'approbation (dans l'ordre)</Label>
              {def.steps.map((s: Row, i: number) => {
                const upd = (p: Row) => setDef({ ...def, steps: def.steps.map((x: Row, j: number) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <span className="col-span-1 pb-2 font-semibold">{i + 1}.</span>
                    <div className="col-span-3"><Input placeholder="Libellé" value={s.label ?? ""} onChange={(e) => upd({ label: e.target.value })} /></div>
                    <div className="col-span-3"><RolePicker roles={d.roles ?? []} value={s.role_code} onChange={(v) => upd({ role_code: v })} /></div>
                    <div className="col-span-1"><Input type="number" min={1} title="SLA (heures)" placeholder="h" value={s.sla_hours ?? ""} onChange={(e) => upd({ sla_hours: e.target.value })} /></div>
                    <div className="col-span-3"><RolePicker roles={d.roles ?? []} value={s.escalation_role_code ?? ""} onChange={(v) => upd({ escalation_role_code: v })} allowAny anyLabel="Pas d'escalade" /></div>
                    <Button className="col-span-1" size="icon" variant="ghost" disabled={def.steps.length === 1} onClick={() => setDef({ ...def, steps: def.steps.filter((_: Row, j: number) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Colonnes : libellé · rôle approbateur · délai (heures) · rôle d'escalade.</p>
              <Button size="sm" variant="outline" onClick={() => setDef({ ...def, steps: [...def.steps, { label: "", role_code: "controller", sla_hours: 24 }] })}><Plus className="h-4 w-4 mr-1" />Étape</Button>
            </div>
          </div>}
          <DialogFooter><Button disabled={busy} onClick={saveDef}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Délégation */}
      <Dialog open={!!deleg} onOpenChange={(o) => !o && setDeleg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Délégation temporaire</DialogTitle></DialogHeader>
          {deleg && <div className="space-y-3">
            <div><Label>Délégataire</Label><Select value={deleg.delegate_id} onValueChange={(v) => setDeleg({ ...deleg, delegate_id: v })}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>{(d.profiles ?? []).filter((p) => p.is_active && p.user_id !== user?.id).map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name ?? p.user_id}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Module</Label><Select value={deleg.module || "all"} onValueChange={(v) => setDeleg({ ...deleg, module: v === "all" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous</SelectItem>{Object.entries(WORKFLOW_MODULES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Début</Label><Input type="datetime-local" value={deleg.starts_at} onChange={(e) => setDeleg({ ...deleg, starts_at: e.target.value })} /></div>
              <div><Label>Fin</Label><Input type="datetime-local" value={deleg.ends_at} onChange={(e) => setDeleg({ ...deleg, ends_at: e.target.value })} /></div>
            </div>
            <div><Label>Motif</Label><Input value={deleg.reason} onChange={(e) => setDeleg({ ...deleg, reason: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Le délégataire ne peut valider qu'à votre place, sur les étapes de votre rôle, dans le pays actif. 90 jours maximum.</p>
          </div>}
          <DialogFooter><Button disabled={busy || !deleg?.delegate_id || !deleg?.reason} onClick={async () => {
            if (await run(db.rpc("workflow_delegate", { _tenant: tenantId, _country: countryId, _delegate: deleg!.delegate_id, _module: deleg!.module || null,
              _starts: new Date(deleg!.starts_at).toISOString(), _ends: new Date(deleg!.ends_at).toISOString(), _reason: deleg!.reason }), "Délégation créée")) setDeleg(null);
          }}>Déléguer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const OpPicker = ({ value, onChange }: { value: Row; onChange: (v: Row) => void }) => (
  <div className="grid grid-cols-2 gap-2">
    <div><Label>Module</Label><Select value={value.module} onValueChange={(v) => onChange({ ...value, module: v, operation_type: WORKFLOW_OPERATIONS.find((o) => o.module === v)?.code ?? "other" })}>
      <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(WORKFLOW_MODULES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
    <div><Label>Type d'opération</Label><Select value={value.operation_type} onValueChange={(v) => onChange({ ...value, operation_type: v })}>
      <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{WORKFLOW_OPERATIONS.filter((o) => o.module === value.module || o.module === "*").map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent></Select></div>
  </div>
);

const RolePicker = ({ roles, value, onChange, allowAny, anyLabel = "Tout rôle" }: { roles: Row[]; value: string; onChange: (v: string) => void; allowAny?: boolean; anyLabel?: string }) => (
  <Select value={value || "__any"} onValueChange={(v) => onChange(v === "__any" ? "" : v)}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      {allowAny && <SelectItem value="__any">{anyLabel}</SelectItem>}
      {roles.filter((r, i, a) => a.findIndex((x) => x.code === r.code) === i).map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
    </SelectContent>
  </Select>
);

export default WorkflowModule;
