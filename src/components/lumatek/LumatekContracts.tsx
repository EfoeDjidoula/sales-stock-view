import { useState } from "react";
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
import { Plus, Pencil, RefreshCw, PauseCircle, PlayCircle, History, BellRing, ExternalLink, Banknote, Trash2 } from "lucide-react";
import {
  useMaintenanceContracts, CONTRACT_STATUSES, contractEffectiveStatus, contractAlert, daysLeft,
  MaintenanceContract, ContractStatus,
} from "@/hooks/useMaintenanceContracts";
import { useContractPayments, MONTHS_FR } from "@/hooks/useContractPayments";
import { useLumatekTenants } from "@/hooks/useLumatekTenants";

export const CONTRACT_STATUS_META: Record<ContractStatus, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  renewal_due: { label: "À renouveler", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  expired: { label: "Expiré", className: "bg-destructive/15 text-destructive border-destructive/30" },
  suspended: { label: "Suspendu", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  terminated: { label: "Résilié", className: "bg-muted text-muted-foreground border-border line-through" },
};
const FREQ: Record<string, string> = {
  monthly: "Mensuelle", quarterly: "Trimestrielle", semiannual: "Semestrielle", annual: "Annuelle", one_time: "Unique",
};
const today = () => new Date().toISOString().slice(0, 10);
const inOneYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

export const LumatekContracts = () => {
  const { contracts, isLoading, save, renew, setStatus } = useMaintenanceContracts();
  const { forContract, paidFor, remainingFor, add, remove } = useContractPayments();
  const { tenants } = useLumatekTenants();
  const [edit, setEdit] = useState<Partial<MaintenanceContract> | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<MaintenanceContract | null>(null);
  const [pay, setPay] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: 0, date: today(), notes: "" });
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.trade_name || "—";

  const openPay = (c: MaintenanceContract) => {
    setPayFor(c);
    setPay({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: remainingFor(c.id, c.amount), date: today(), notes: "" });
  };

  const submitPay = async () => {
    if (!payFor || pay.amount <= 0) return;
    await add.mutateAsync({
      contract_id: payFor.id, tenant_id: payFor.tenant_id,
      payment_month: pay.month, payment_year: pay.year,
      amount: pay.amount, payment_date: pay.date, notes: pay.notes.trim() || null,
    });
    setPay({ ...pay, amount: 0, notes: "" });
  };

  const alerts = contracts
    .map((c) => ({ c, a: contractAlert(c) }))
    .filter((x) => x.a != null)
    .sort((x, y) => daysLeft(x.c.end_date) - daysLeft(y.c.end_date));

  const submit = async () => {
    if (!edit?.tenant_id || !edit.start_date || !edit.end_date || edit.end_date < edit.start_date) return;
    if ((edit.amount ?? 0) < 0) return;
    await save.mutateAsync(edit);
    setEdit(null);
  };

  const txt = (k: keyof MaintenanceContract, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} min={type === "number" ? 0 : undefined} value={(edit?.[k] as string | number | null) ?? ""}
        onChange={(e) => setEdit({ ...edit!, [k]: type === "number" ? Math.max(0, Number(e.target.value) || 0) : e.target.value })} />
    </div>
  );

  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  const history = historyOf ? contracts.filter((c) => c.tenant_id === historyOf) : [];

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-amber-400" /> Échéances à venir</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {alerts.map(({ c, a }) => (
              <div key={c.id} className="flex justify-between border-b border-border/50 py-1">
                <span>{tenantName(c.tenant_id)} · <span className="font-mono text-xs">{c.contract_number}</span></span>
                <span className="text-amber-400">J-{a} · fin le {c.end_date} ({daysLeft(c.end_date)} j)</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-indigo-500/20">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Contrats de maintenance</CardTitle>
          <Button className="gap-2" onClick={() => setEdit({
            tenant_id: tenants[0]?.id, contract_type: "standard", start_date: today(), end_date: inOneYear(),
            signature_date: today(), amount: 0, billing_frequency: "annual", support_level: "standard", status: "active",
          })}><Plus className="h-4 w-4" /> Nouveau contrat</Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° contrat</TableHead><TableHead>Client</TableHead><TableHead>Type</TableHead>
                <TableHead>Période</TableHead><TableHead>Montant</TableHead><TableHead>Reste à payer</TableHead><TableHead>SLA</TableHead>
                <TableHead>Responsable</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((c) => {
                const st = contractEffectiveStatus(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.contract_number}
                      {c.document_url && <a href={c.document_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex"><ExternalLink className="h-3 w-3" /></a>}
                    </TableCell>
                    <TableCell>{tenantName(c.tenant_id)}</TableCell>
                    <TableCell>{c.contract_type}<div className="text-xs text-muted-foreground">{c.support_level}</div></TableCell>
                    <TableCell className="text-xs">{c.start_date} → {c.end_date}</TableCell>
                    <TableCell className="text-xs">{Number(c.amount).toLocaleString("fr-FR")}<div className="text-muted-foreground">{FREQ[c.billing_frequency] || c.billing_frequency}</div></TableCell>
                    <TableCell className="text-xs">
                      {remainingFor(c.id, c.amount) === 0 ? (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Soldé</Badge>
                      ) : (
                        <span className="font-semibold text-amber-400">{remainingFor(c.id, c.amount).toLocaleString("fr-FR")}</span>
                      )}
                      <div className="text-muted-foreground">Payé : {paidFor(c.id).toLocaleString("fr-FR")}</div>
                    </TableCell>
                    <TableCell className="text-xs">{c.sla || "—"}</TableCell>
                    <TableCell className="text-xs">{c.lumatek_manager || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={CONTRACT_STATUS_META[st].className}>{CONTRACT_STATUS_META[st].label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Renouveler (historique conservé)" disabled={c.status === "terminated"} onClick={() => renew.mutate(c)}><RefreshCw className="h-4 w-4" /></Button>
                        {c.status === "suspended" ? (
                          <Button size="icon" variant="ghost" title="Réactiver" onClick={() => setStatus.mutate({ id: c.id, status: "active" })}><PlayCircle className="h-4 w-4 text-emerald-500" /></Button>
                        ) : (
                          <Button size="icon" variant="ghost" title="Suspendre" disabled={c.status === "terminated"} onClick={() => setStatus.mutate({ id: c.id, status: "suspended" })}><PauseCircle className="h-4 w-4 text-destructive" /></Button>
                        )}
                        <Button size="icon" variant="ghost" title="Historique du client" onClick={() => setHistoryOf(c.tenant_id)}><History className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Modifier" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {contracts.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Aucun contrat.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Modifier le contrat" : "Nouveau contrat"}</DialogTitle>
            <DialogDescription>Le numéro est généré automatiquement si vous le laissez vide.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={edit.tenant_id} onValueChange={(v) => setEdit({ ...edit, tenant_id: v })} disabled={!!edit.id}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.trade_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {txt("contract_number", "N° contrat")}
              {txt("contract_type", "Type de contrat")}
              {txt("support_level", "Niveau de support")}
              {txt("signature_date", "Date de signature", "date")}
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as ContractStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{CONTRACT_STATUS_META[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {txt("start_date", "Date de début *", "date")}
              <div>
                {txt("end_date", "Date de fin *", "date")}
                {edit.start_date && edit.end_date && edit.end_date < edit.start_date && <p className="text-xs text-destructive">La fin doit suivre le début.</p>}
              </div>
              {txt("amount", "Montant", "number")}
              <div className="space-y-1.5">
                <Label>Facturation</Label>
                <Select value={edit.billing_frequency} onValueChange={(v) => setEdit({ ...edit, billing_frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FREQ).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {txt("sla", "SLA (ex : intervention sous 4 h)")}
              {txt("lumatek_manager", "Responsable LUMATEK")}
              {txt("client_contact", "Contact client")}
              {txt("document_url", "Lien du document", "url")}
              <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={submit} disabled={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique des contrats — {historyOf && tenantName(historyOf)}</DialogTitle>
            <DialogDescription>Chaque renouvellement conserve le contrat précédent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            {history.map((c) => {
              const st = contractEffectiveStatus(c);
              return (
                <div key={c.id} className="flex items-center justify-between border-b border-border/50 py-1.5">
                  <span className="font-mono text-xs">{c.contract_number}</span>
                  <span className="text-xs">{c.start_date} → {c.end_date}</span>
                  <Badge variant="outline" className={CONTRACT_STATUS_META[st].className}>{CONTRACT_STATUS_META[st].label}</Badge>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
