import { useMemo, useRef, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Paperclip, Send, AlertTriangle, Eye } from "lucide-react";
import {
  useSupportTickets, useTicketEvents, useLumatekAgents, uploadAttachments, openAttachment, slaBreached,
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, SupportTicket, TicketStatus, TicketPriority, TicketCategory, Attachment,
} from "@/hooks/useSupportTickets";
import { useModuleCatalog } from "@/hooks/useModules";
import { useStations } from "@/hooks/useStations";
import { useScope } from "@/hooks/useScope";
import { useLumatekTenants } from "@/hooks/useLumatekTenants";
import { toast } from "sonner";

const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const SBadge = ({ s }: { s: TicketStatus }) => <Badge variant="outline" className={TICKET_STATUSES[s].cls}>{TICKET_STATUSES[s].label}</Badge>;
const PBadge = ({ p }: { p: TicketPriority }) => <Badge variant="outline" className={TICKET_PRIORITIES[p].cls}>{TICKET_PRIORITIES[p].label}</Badge>;

const FilePicker = ({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) => {
  const { t } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}><Paperclip className="h-4 w-4 mr-1" />{t("Joindre")}</Button>
      {files.map((f, i) => (
        <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setFiles(files.filter((_, k) => k !== i))}>{f.name} ✕</Badge>
      ))}
      <input ref={ref} type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
    </div>
  );
};

const AttachList = ({ list }: { list: Attachment[] }) =>
  list?.length ? (
    <div className="flex flex-wrap gap-2 mt-1">
      {list.map((a) => (
        <button key={a.path} type="button" onClick={() => openAttachment(a)} className="text-xs text-primary underline inline-flex items-center gap-1">
          <Paperclip className="h-3 w-3" />{a.name}
        </button>
      ))}
    </div>
  ) : null;

export const SupportTickets = ({ mode }: { mode: "client" | "lumatek" }) => {
  const { t } = useLanguage();
  const isLumatek = mode === "lumatek";
  const { tenantId, countryId } = useScope();
  const { tickets, isLoading, create, update, comment } = useSupportTickets(isLumatek ? null : tenantId);
  const { data: modules = [] } = useModuleCatalog();
  const { stations } = useStations();
  const { tenants } = useLumatekTenants();
  const { data: agents = [] } = useLumatekAgents(isLumatek);
  const [statusF, setStatusF] = useState<string>("open");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "assistance" as TicketCategory, priority: "normal" as TicketPriority, subject: "", description: "", module_key: "", station_id: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewId, setViewId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("ticket"));
  const viewed = tickets.find((t) => t.id === viewId) || null;

  const moduleLabel = (k?: string | null) => modules.find((m) => m.key === k)?.label || k || "—";
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.trade_name || "—";
  const stationName = (id?: string | null) => stations.find((s) => s.id === id)?.name || (id ? "Station" : "—");

  const rows = useMemo(() => tickets.filter((t) =>
    statusF === "all" ? true : statusF === "open" ? !["resolved", "closed"].includes(t.status) : t.status === statusF), [tickets, statusF]);
  const counts = useMemo(() => ({
    open: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
    critical: tickets.filter((t) => t.priority === "critical" && !["resolved", "closed"].includes(t.status)).length,
    breached: tickets.filter((t) => !["closed"].includes(t.status) && slaBreached(t)).length,
  }), [tickets]);

  const submitNew = async () => {
    if (!tenantId) return toast.error("Aucun espace de travail actif");
    if (!form.subject.trim()) return toast.error("L'objet est obligatoire");
    setBusy(true);
    try {
      const attachments = await uploadAttachments(tenantId, files);
      await create.mutateAsync({
        tenant_id: tenantId, country_id: countryId, station_id: form.station_id || null, module_key: form.module_key || null,
        category: form.category, priority: form.priority, subject: form.subject.trim(), description: form.description.trim(), attachments,
      });
      setCreating(false); setFiles([]);
      setForm({ category: "assistance", priority: "normal", subject: "", description: "", module_key: "", station_id: "" });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("Tickets ouverts")}</div><div className="text-2xl font-semibold">{counts.open}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("Critiques ouverts")}</div><div className="text-2xl font-semibold text-destructive">{counts.critical}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("SLA dépassés")}</div><div className="text-2xl font-semibold text-orange-400">{counts.breached}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{isLumatek ? "Tickets clients" : "Mes tickets"}</CardTitle>
          <div className="flex gap-2">
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("Ouverts")}</SelectItem>
                <SelectItem value="all">{t("Tous")}</SelectItem>
                {Object.entries(TICKET_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!isLumatek && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />{t("Nouveau ticket")}</Button>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <Skeleton className="h-32 w-full" /> : !rows.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("Aucun ticket.")}</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>N°</TableHead><TableHead>{t("Ouvert le")}</TableHead>{isLumatek && <TableHead>{t("Client")}</TableHead>}
                <TableHead>{t("Objet")}</TableHead><TableHead>{t("Catégorie")}</TableHead><TableHead>{t("Priorité")}</TableHead>
                <TableHead>{t("Statut")}</TableHead><TableHead>{t("Responsable")}</TableHead><TableHead>SLA</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setViewId(t.id)}>
                    <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                    <TableCell className="text-xs">{dt(t.created_at)}</TableCell>
                    {isLumatek && <TableCell>{tenantName(t.tenant_id)}</TableCell>}
                    <TableCell className="max-w-[240px] truncate">{t.subject}<div className="text-xs text-muted-foreground">{moduleLabel(t.module_key)}</div></TableCell>
                    <TableCell className="text-xs">{TICKET_CATEGORIES[t.category]}</TableCell>
                    <TableCell><PBadge p={t.priority} /></TableCell>
                    <TableCell><SBadge s={t.status} /></TableCell>
                    <TableCell className="text-xs">{t.assigned_to_name || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {slaBreached(t) ? <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("Dépassé")}</span> : `${t.sla_hours} h`}
                    </TableCell>
                    <TableCell><Button size="icon" variant="ghost" aria-label={t("Ouvrir")}><Eye className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Création (client) */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("Nouveau ticket")}</DialogTitle><DialogDescription>{t("Le support LUMATEK sera notifié.")}</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t("Catégorie *")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as TicketCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TICKET_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>{t("Priorité *")}</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TicketPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TICKET_PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>{t("Module")}</Label>
              <Select value={form.module_key || "none"} onValueChange={(v) => setForm({ ...form, module_key: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">{t("Non précisé")}</SelectItem>{modules.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>{t("Station (si applicable)")}</Label>
              <Select value={form.station_id || "none"} onValueChange={(v) => setForm({ ...form, station_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">{t("Aucune")}</SelectItem>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>{t("Objet *")}</Label><Input value={form.subject} maxLength={200} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>{t("Description")}</Label><Textarea rows={5} value={form.description} maxLength={5000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>{t("Pièces jointes (10 Mo max chacune)")}</Label><FilePicker files={files} setFiles={setFiles} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>{t("Annuler")}</Button>
            <Button onClick={submitNew} disabled={busy}>{busy ? "Envoi…" : "Créer le ticket"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewed && (
        <TicketDetail ticket={viewed} isLumatek={isLumatek} onClose={() => setViewId(null)}
          tenantName={tenantName(viewed.tenant_id)} moduleLabel={moduleLabel(viewed.module_key)} stationName={stationName(viewed.station_id)}
          agents={agents} update={update} comment={comment} />
      )}
    </div>
  );
};

type Hook = ReturnType<typeof useSupportTickets>;
const TicketDetail = ({ ticket: t, isLumatek, onClose, tenantName, moduleLabel, stationName, agents, update, comment }: {
  ticket: SupportTicket; isLumatek: boolean; onClose: () => void; tenantName: string; moduleLabel: string; stationName: string;
  agents: { id: string; name: string }[]; update: Hook["update"]; comment: Hook["comment"];
}) => {
  const { t: translate } = useLanguage();
  const { data: events = [], isLoading } = useTicketEvents(t.id);
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!msg.trim() && !files.length) return;
    setBusy(true);
    try {
      const attachments = await uploadAttachments(t.tenant_id, files);
      await comment.mutateAsync({ ticket: t, message: msg.trim(), attachments, isLumatek, authorName: isLumatek ? "Support LUMATEK" : null });
      setMsg(""); setFiles([]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const describe = (e: typeof events[number]) =>
    e.event_type === "created" ? "a ouvert le ticket"
    : e.event_type === "assign" ? `a assigné à ${e.message}`
    : e.event_type === "status" ? `statut : ${TICKET_STATUSES[e.from_status as TicketStatus]?.label ?? e.from_status} → ${TICKET_STATUSES[e.to_status as TicketStatus]?.label ?? e.to_status}`
    : "";

  const info: [string, React.ReactNode][] = [
    ["Client", tenantName], ["Module", moduleLabel], ["Station", stationName], ["Catégorie", TICKET_CATEGORIES[t.category]],
    ["Priorité", <PBadge p={t.priority} />], ["Statut", <SBadge s={t.status} />], ["Ouvert par", t.created_by_name || "—"],
    ["Ouvert le", dt(t.created_at)], ["Responsable LUMATEK", t.assigned_to_name || "—"],
    ["SLA", <span className={slaBreached(t) ? "text-destructive" : ""}>{t.sla_hours} h · échéance {dt(t.sla_due_at)}</span>],
    ["Première réponse", dt(t.first_response_at)], ["Résolution", dt(t.resolved_at)],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{t.ticket_number}</span>{t.subject}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {info.map(([l, v]) => <div key={l}><div className="text-xs text-muted-foreground">{l}</div><div>{v}</div></div>)}
        </div>
        {t.description && <p className="whitespace-pre-wrap rounded-md border border-border p-3 text-sm">{t.description}</p>}
        <AttachList list={t.attachments} />

        {isLumatek ? (
          <div className="grid gap-3 sm:grid-cols-3 rounded-md border border-border p-3">
            <div className="space-y-1.5"><Label>{translate("Responsable")}</Label>
              <Select value={t.assigned_to || "none"} onValueChange={(v) => update.mutate({ id: t.id, assigned_to: v === "none" ? null : v, assigned_to_name: v === "none" ? null : agents.find((a) => a.id === v)?.name ?? null })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">{translate("Non assigné")}</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>{translate("Statut")}</Label>
              <Select value={t.status} onValueChange={(v) => update.mutate({ id: t.id, status: v as TicketStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TICKET_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>{translate("Priorité")}</Label>
              <Select value={t.priority} onValueChange={(v) => update.mutate({ id: t.id, priority: v as TicketPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TICKET_PRIORITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {["waiting_client", "resolved"].includes(t.status) && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: t.id, status: "in_progress" })}>{translate("Relancer le ticket")}</Button>}
            {t.status !== "closed" && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: t.id, status: "closed" })}>{translate("Fermer le ticket")}</Button>}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{translate("Historique")}</h4>
          {isLoading ? <Skeleton className="h-20" /> : events.map((e) => (
            <div key={e.id} className={`rounded-md border p-2 text-sm ${e.event_type === "comment" ? (e.is_lumatek ? "border-primary/40 bg-primary/5" : "border-border") : "border-transparent text-muted-foreground"}`}>
              <div className="text-xs"><span className="font-medium">{e.author_name || (e.is_lumatek ? "Support LUMATEK" : "Client")}</span> · {dt(e.created_at)} {describe(e)}</div>
              {e.event_type === "comment" && e.message && <p className="whitespace-pre-wrap mt-1">{e.message}</p>}
              <AttachList list={e.attachments} />
            </div>
          ))}
        </div>

        {t.status !== "closed" && (
          <div className="space-y-2">
            <Textarea rows={3} placeholder={translate("Votre message…")} value={msg} maxLength={5000} onChange={(e) => setMsg(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <FilePicker files={files} setFiles={setFiles} />
              <Button size="sm" onClick={send} disabled={busy}><Send className="h-4 w-4 mr-1" />{busy ? "Envoi…" : "Envoyer"}</Button>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>{translate("Fermer")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
