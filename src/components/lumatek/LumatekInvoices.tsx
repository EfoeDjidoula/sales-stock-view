import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Plus, Pencil, Trash2, Banknote } from "lucide-react";
import { useMaintenanceContracts } from "@/hooks/useMaintenanceContracts";
import { MONTHS_FR } from "@/hooks/useContractPayments";
import { useLumatekTenants } from "@/hooks/useLumatekTenants";

interface Invoice {
  id?: string;
  invoice_number?: string;
  contract_id: string;
  tenant_id: string;
  invoice_date: string;
  invoice_month: number;
  invoice_year: number;
  amount: number;
  amount_paid: number;
  payment_date: string | null;
  notes: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => Number(n).toLocaleString("fr-FR");
const errMsg = (e: unknown) => (e as { message?: string })?.message || "Erreur inconnue";

const statusOf = (i: Invoice) => {
  const paid = Number(i.amount_paid), amt = Number(i.amount);
  if (paid >= amt) return { label: "Payée", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (paid > 0) return { label: "Partielle", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: "Impayée", cls: "bg-destructive/15 text-destructive border-destructive/30" };
};

export const LumatekInvoices = () => {
  const qc = useQueryClient();
  const { contracts } = useMaintenanceContracts();
  const { tenants } = useLumatekTenants();
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<Invoice | null>(null);
  const [payOf, setPayOf] = useState<Invoice | null>(null);
  const [pay, setPay] = useState({ amount: 0, date: today() });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["contract-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contract_invoices").select("*")
        .order("invoice_year", { ascending: false }).order("invoice_month", { ascending: false });
      if (error) throw error;
      return (data || []) as Invoice[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contract-invoices"] });
  const save = useMutation({
    mutationFn: async (i: Invoice) => {
      if (!i.contract_id) throw new Error("Choisissez un contrat.");
      if (!(i.amount > 0)) throw new Error("Le montant doit être supérieur à zéro.");
      if (i.amount_paid < 0) throw new Error("Le paiement ne peut pas être négatif.");
      const row = { ...i, notes: i.notes?.trim() || null, invoice_number: i.invoice_number?.trim() || undefined };
      const { error } = i.id
        ? await supabase.from("contract_invoices").update(row as never).eq("id", i.id)
        : await supabase.from("contract_invoices").insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Facture enregistrée"); setEdit(null); setPayOf(null); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Facture supprimée"); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const contractLabel = (id: string) => contracts.find((c) => c.id === id)?.contract_number || "—";
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.trade_name || "—";
  const rows = useMemo(() => invoices.filter((i) => filter === "all" || i.contract_id === filter), [invoices, filter]);
  const totals = rows.reduce((s, i) => ({ amt: s.amt + Number(i.amount), paid: s.paid + Number(i.amount_paid) }), { amt: 0, paid: 0 });

  const newInvoice = () => {
    const c = contracts.find((x) => x.id === filter) || contracts[0];
    const d = new Date();
    setEdit({ contract_id: c?.id || "", tenant_id: c?.tenant_id || "", invoice_date: today(), invoice_month: d.getMonth() + 1,
      invoice_year: d.getFullYear(), amount: 0, amount_paid: 0, payment_date: null, notes: "" });
  };

  const num = (k: keyof Invoice, label: string) => (
    <div className="space-y-1.5"><Label>{label}</Label>
      <Input type="number" min={0} value={String(edit?.[k] ?? "")} onChange={(e) => setEdit(edit && { ...edit, [k]: Number(e.target.value) })} /></div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Total facturé", totals.amt], ["Total payé", totals.paid], ["Reste à encaisser", Math.max(0, totals.amt - totals.paid)]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-semibold">{fmt(v as number)} FCFA</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Factures clients</CardTitle>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les contrats</SelectItem>
                {contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.contract_number} — {tenantName(c.tenant_id)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={newInvoice} disabled={!contracts.length}><Plus className="h-4 w-4 mr-1" />Nouvelle facture</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <Skeleton className="h-32 w-full" /> : !rows.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune facture.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>N° facture</TableHead><TableHead>Date</TableHead><TableHead>Contrat</TableHead><TableHead>Client</TableHead>
                <TableHead>Mois</TableHead><TableHead>Année</TableHead><TableHead>Montant</TableHead><TableHead>Paiement</TableHead>
                <TableHead>État</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((i) => {
                  const st = statusOf(i);
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                      <TableCell className="text-xs">{i.invoice_date}</TableCell>
                      <TableCell className="font-mono text-xs">{contractLabel(i.contract_id)}</TableCell>
                      <TableCell>{tenantName(i.tenant_id)}</TableCell>
                      <TableCell>{MONTHS_FR[i.invoice_month - 1]}</TableCell>
                      <TableCell>{i.invoice_year}</TableCell>
                      <TableCell className="text-xs">{fmt(i.amount)}</TableCell>
                      <TableCell className="text-xs">{fmt(i.amount_paid)}{i.payment_date && <div className="text-muted-foreground">le {i.payment_date}</div>}</TableCell>
                      <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" title="Paiement" onClick={() => { setPayOf(i); setPay({ amount: Math.max(0, Number(i.amount) - Number(i.amount_paid)), date: today() }); }}><Banknote className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Modifier" onClick={() => setEdit(i)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Supprimer" onClick={() => confirm("Supprimer cette facture ?") && remove.mutate(i.id!)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Modifier la facture" : "Nouvelle facture"}</DialogTitle>
            <DialogDescription>Le numéro est généré automatiquement si vous le laissez vide.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Contrat *</Label>
                <Select value={edit.contract_id} disabled={!!edit.id} onValueChange={(v) => setEdit({ ...edit, contract_id: v, tenant_id: contracts.find((c) => c.id === v)?.tenant_id || "" })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{contracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.contract_number} — {tenantName(c.tenant_id)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>N° facture</Label><Input value={edit.invoice_number ?? ""} onChange={(e) => setEdit({ ...edit, invoice_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={edit.invoice_date} onChange={(e) => setEdit({ ...edit, invoice_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Mois</Label>
                <Select value={String(edit.invoice_month)} onValueChange={(v) => setEdit({ ...edit, invoice_month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS_FR.map((m, k) => <SelectItem key={m} value={String(k + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {num("invoice_year", "Année")}
              {num("amount", "Montant *")}
              {num("amount_paid", "Montant payé")}
              <div className="space-y-1.5"><Label>Date de paiement</Label><Input type="date" value={edit.payment_date ?? ""} onChange={(e) => setEdit({ ...edit, payment_date: e.target.value || null })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={() => edit && save.mutate(edit)} disabled={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payOf} onOpenChange={(o) => !o && setPayOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Paiement — {payOf?.invoice_number}</DialogTitle>
            <DialogDescription>
              Montant {fmt(payOf?.amount ?? 0)} · déjà payé {fmt(payOf?.amount_paid ?? 0)} · reste {fmt(Math.max(0, Number(payOf?.amount ?? 0) - Number(payOf?.amount_paid ?? 0)))} FCFA
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Montant encaissé</Label><Input type="number" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOf(null)}>Annuler</Button>
            <Button disabled={!(pay.amount > 0) || save.isPending}
              onClick={() => payOf && save.mutate({ ...payOf, amount_paid: Number(payOf.amount_paid) + pay.amount, payment_date: pay.date })}>
              Enregistrer le paiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
