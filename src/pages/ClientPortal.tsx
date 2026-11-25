import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban, Building2, Car, CreditCard, Download, FileText, Fuel, Inbox, Loader2, LogOut, Plus, Receipt, Send, UserRound, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { csvRow } from "@/lib/csv";
import { PortalDeliveryNotes } from "@/components/clients/PortalDeliveryNotes";
import { jsPDF } from "@/lib/pdf";
import {
  CARD_STATUS_LABEL, PORTAL_REQUEST_LABEL, PORTAL_STATUS_LABEL, creditSummary, formatMoney, invoiceState,
} from "@/lib/clientPortal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Overview {
  me: { full_name: string; email: string; can_manage: boolean };
  modules: { b2b: boolean; cards: boolean };
  since: string;
  tenant: { name: string; logo_url: string | null; phone: string | null; email: string | null; currency: string; show_powered_by: boolean; powered_by_label: string } | null;
  client: { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null };
  terms: { credit_limit: number; payment_days: number; policy: string; contract_reference: string; effective_at: string } | null;
  exposure: number;
  accounts: { id: string; kind: string; contract_reference: string | null; credit_limit: number; prepaid_balance: number; credit_used: number; status: string }[];
  cards: { id: string; account_id: string; card_number: string; holder_name: string | null; expires_on: string; allocated_limit: number; remaining: number; status: string; vehicle_id: string | null; driver_id: string | null }[];
  drivers: { id: string; account_id: string; name: string; phone: string | null; active: boolean }[];
  vehicles: { id: string; account_id: string; plate: string; description: string | null; active: boolean }[];
  transactions: { id: string; occurred_at: string; kind: string; amount: number; litres: number | null; reference: string | null; card_id: string | null; driver_id: string | null; vehicle_id: string | null; station: string | null; product: string | null }[];
  consumptions: { id: string; consumed_on: string; reference: string; litres: number; unit_price: number; amount: number; station: string | null; product: string | null }[];
  invoices: { id: string; source: "b2b" | "cards"; number: string; period_start: string; period_end: string; due_on: string | null; amount: number; paid: number }[];
  payments: { id: string; invoice_id: string; amount: number; reference: string; paid_on: string }[];
  requests: { id: string; reference: string; kind: string; amount: number | null; card_id: string | null; message: string; status: string; created_at: string; decided_at: string | null; decision_comment: string | null; requester_name: string | null }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("fr-FR") : "—");
const num = (n: number | null | undefined, digits = 0) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(n ?? 0));

const download = (name: string, content: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

type Purchase = { key: string; date: string; source: string; reference: string; station: string; product: string; litres: number; amount: number; who: string };

const ClientPortal = () => {
  const { signOut } = useAuth();
  const { language, setLanguage } = useLanguage();
  const cache = useQueryClient();
  const [period, setPeriod] = useState("90");
  const [busy, setBusy] = useState(false);
  const [blockCard, setBlockCard] = useState<Overview["cards"][number] | null>(null);
  const [assign, setAssign] = useState<Overview["cards"][number] | null>(null);
  const [assignForm, setAssignForm] = useState({ driver_id: "", vehicle_id: "" });
  const [adding, setAdding] = useState<null | "driver" | "vehicle">(null);
  const [addForm, setAddForm] = useState({ account_id: "", name: "", phone: "", plate: "", description: "" });
  const [request, setRequest] = useState({ kind: "credit_limit", amount: "", card_id: "", message: "" });

  const q = useQuery({
    queryKey: ["client-portal", period],
    queryFn: async () => {
      const { data, error } = await db.rpc("b2b_portal_overview", { _since: daysAgo(Number(period)) });
      if (error) throw error;
      return data as Overview;
    },
  });
  const o = q.data;
  // XOF is shown as FCFA, as everywhere else in the app.
  const cur = !o?.tenant?.currency || o.tenant.currency === "XOF" ? "FCFA" : o.tenant.currency;
  const money = (n: number) => formatMoney(n, cur);
  const credit = creditSummary(o?.terms?.credit_limit, o?.exposure ?? 0);
  const canManage = !!o?.me.can_manage;

  const act = async (action: string, data: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("b2b_portal_action", { _action: action, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok);
    cache.invalidateQueries({ queryKey: ["client-portal"] });
    return true;
  };

  const driverName = (id: string | null) => o?.drivers.find((d) => d.id === id)?.name ?? "—";
  const plate = (id: string | null) => o?.vehicles.find((v) => v.id === id)?.plate ?? "—";
  const cardNo = (id: string | null) => o?.cards.find((c) => c.id === id)?.card_number ?? "—";

  const purchases = useMemo<Purchase[]>(() => {
    if (!o) return [];
    const fromCards = o.transactions.filter((t) => t.kind === "purchase").map((t) => ({
      key: `t-${t.id}`, date: t.occurred_at, source: `Carte ${cardNo(t.card_id)}`, reference: t.reference ?? "", station: t.station ?? "—", product: t.product ?? "—",
      litres: Number(t.litres ?? 0), amount: Number(t.amount), who: [driverName(t.driver_id), plate(t.vehicle_id)].filter((x) => x !== "—").join(" · ") || "—",
    }));
    const fromB2b = o.consumptions.map((c) => ({
      key: `c-${c.id}`, date: c.consumed_on, source: "Bon / compte client", reference: c.reference, station: c.station ?? "—", product: c.product ?? "—",
      litres: Number(c.litres), amount: Number(c.amount), who: "—",
    }));
    return [...fromCards, ...fromB2b].sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o]);
  const totals = purchases.reduce((s, p) => ({ litres: s.litres + p.litres, amount: s.amount + p.amount }), { litres: 0, amount: 0 });
  const t0 = today();
  const unpaid = (o?.invoices ?? []).reduce((s, i) => s + Math.max(0, Number(i.amount) - Number(i.paid)), 0);
  const overdue = (o?.invoices ?? []).filter((i) => invoiceState(i, t0) === "overdue");
  const openRequests = (o?.requests ?? []).filter((r) => r.status === "open").length;

  const exportCsv = () => {
    const lines = [csvRow(["Date", "Moyen", "Référence", "Station", "Produit", "Litres", "Montant", "Conducteur / véhicule"]),
      ...purchases.map((p) => csvRow([fmtDate(p.date), p.source, p.reference, p.station, p.product, p.litres, Math.round(p.amount), p.who]))];
    download(`consommations_${o?.client.name ?? "client"}_${t0}.csv`, "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
  };

  const exportStatement = () => {
    if (!o) return;
    const doc = new jsPDF();
    const pdfMoney = (n: number) => `${num(n)} ${cur}`;
    doc.setFontSize(15); doc.text(`Relevé de compte — ${o.client.name}`, 14, 18);
    doc.setFontSize(9);
    doc.text(`${o.tenant?.name ?? ""} · édité le ${fmtDate(t0)}`, 14, 25);
    if (o.terms) doc.text(`Plafond de crédit : ${pdfMoney(o.terms.credit_limit)} · Encours : ${pdfMoney(o.exposure)} · Disponible : ${pdfMoney(credit.available ?? 0)}`, 14, 31);
    const cols = [14, 50, 98, 124, 152, 178];
    const head = ["Facture", "Période", "Échéance", "Montant", "Réglé", "Solde"];
    let y = 42;
    doc.setFont("helvetica", "bold"); head.forEach((h, i) => doc.text(h, cols[i], y)); doc.setFont("helvetica", "normal");
    y += 6;
    for (const i of o.invoices) {
      if (y > 280) { doc.addPage(); y = 20; }
      const row = [i.number, `${fmtDate(i.period_start)} - ${fmtDate(i.period_end)}`, fmtDate(i.due_on), pdfMoney(i.amount), pdfMoney(i.paid), pdfMoney(Math.max(0, i.amount - i.paid))];
      row.forEach((c, k) => doc.text(String(c), cols[k], y));
      y += 6;
    }
    y += 4; doc.setFont("helvetica", "bold"); doc.text(`Total restant dû : ${pdfMoney(unpaid)}`, 14, y);
    doc.save(`releve_${o.client.name}_${t0}.pdf`);
  };

  const submitRequest = async () => {
    const ok = await act("request", { kind: request.kind, amount: request.kind === "credit_limit" ? Number(request.amount) : null, card_id: request.card_id || null, message: request.message }, "Demande envoyée");
    if (ok) setRequest({ kind: "credit_limit", amount: "", card_id: "", message: "" });
  };

  if (q.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (q.error || !o) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Ban className="h-10 w-10 text-destructive" />
        <p className="max-w-md text-muted-foreground">{(q.error as Error)?.message ?? "Espace client indisponible."}</p>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Se déconnecter</Button>
      </div>
    );
  }

  const activeCards = o.cards.filter((c) => c.status === "active").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {o.tenant?.logo_url ? <img src={o.tenant.logo_url} alt="" className="h-9 w-9 rounded-md object-contain" /> : <Building2 className="h-8 w-8 text-primary" />}
            <div className="min-w-0">
              <div className="truncate text-xs uppercase tracking-wider text-muted-foreground">{o.tenant?.name} · Espace client</div>
              <div className="truncate font-display text-lg font-semibold" translate="no">{o.client.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right text-xs sm:block"><div className="font-medium">{o.me.full_name}</div><div className="text-muted-foreground">{canManage ? "Gestionnaire" : "Consultation"}</div></div>
            <Button variant="ghost" size="sm" onClick={() => setLanguage(language === "en" ? "fr" : "en")} translate="no">{language === "en" ? "FR" : "EN"}</Button>
            <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Déconnexion</span></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" />Crédit disponible</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {credit.limit == null ? <p className="text-sm text-muted-foreground">Aucun contrat de crédit en vigueur.</p> : <>
                <div className="font-display text-3xl font-semibold tabular-nums">{money(credit.available ?? 0)}</div>
                <Progress value={credit.usedPct ?? 0} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>Encours {money(credit.exposure)} ({num(credit.usedPct, 1)} %)</span><span>Plafond {money(credit.limit)}</span></div>
                {o.terms && <div className="text-xs text-muted-foreground">Contrat {o.terms.contract_reference} · paiement à {o.terms.payment_days} jours</div>}
              </>}
            </CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Receipt className="h-4 w-4" />Reste à payer</CardTitle></CardHeader>
            <CardContent><div className="font-display text-2xl font-semibold tabular-nums">{money(unpaid)}</div>
              <div className={`text-xs ${overdue.length ? "font-medium text-destructive" : "text-muted-foreground"}`}>{overdue.length ? `${overdue.length} facture(s) en retard` : "Aucun retard"}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Fuel className="h-4 w-4" />Consommé ({period} j)</CardTitle></CardHeader>
            <CardContent><div className="font-display text-2xl font-semibold tabular-nums">{num(totals.litres)} L</div>
              <div className="text-xs text-muted-foreground">{money(totals.amount)} · {activeCards} carte(s) active(s)</div></CardContent></Card>
        </section>

        <Tabs defaultValue="purchases">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="purchases"><Fuel className="mr-1 h-4 w-4" />Consommations</TabsTrigger>
            {o.modules.cards && <TabsTrigger value="cards"><CreditCard className="mr-1 h-4 w-4" />Cartes</TabsTrigger>}
            {o.modules.cards && <TabsTrigger value="fleet"><Car className="mr-1 h-4 w-4" />Conducteurs & véhicules</TabsTrigger>}
            <TabsTrigger value="invoices"><FileText className="mr-1 h-4 w-4" />Factures</TabsTrigger>
            <TabsTrigger value="delivery_notes"><FileText className="mr-1 h-4 w-4" />Bons de livraison</TabsTrigger>
            <TabsTrigger value="requests"><Inbox className="mr-1 h-4 w-4" />Demandes{openRequests > 0 && <Badge className="ml-2">{openRequests}</Badge>}</TabsTrigger>
          </TabsList>

          <TabsContent value="purchases" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{[["30", "30 derniers jours"], ["90", "90 derniers jours"], ["180", "6 derniers mois"], ["365", "12 derniers mois"]].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!purchases.length} onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Exporter (CSV)</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Moyen</TableHead><TableHead>Station</TableHead><TableHead>Produit</TableHead><TableHead className="text-right">Litres</TableHead><TableHead className="text-right">Montant</TableHead><TableHead className="hidden md:table-cell">Conducteur / véhicule</TableHead></TableRow></TableHeader>
                <TableBody>
                  {purchases.slice(0, 500).map((p) => (
                    <TableRow key={p.key}><TableCell>{fmtDate(p.date)}</TableCell><TableCell translate="no">{p.source}</TableCell><TableCell>{p.station}</TableCell><TableCell>{p.product}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(p.litres, 2)}</TableCell><TableCell className="text-right tabular-nums">{money(p.amount)}</TableCell><TableCell className="hidden md:table-cell">{p.who}</TableCell></TableRow>
                  ))}
                  {!purchases.length && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Aucune consommation sur la période.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {o.modules.cards && <TabsContent value="cards" className="space-y-3">
            {o.accounts.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
                <span className="font-medium">{a.kind === "postpaid" ? "Compte postpayé" : "Compte prépayé"}</span> · {a.contract_reference ?? "—"} · {a.kind === "postpaid" ? `Plafond ${money(a.credit_limit)} · utilisé ${money(a.credit_used)}` : `Solde ${money(a.prepaid_balance)}`}
                {a.status !== "active" && <Badge variant="destructive" className="ml-2">{a.status === "blocked" ? "Bloqué" : "Expiré"}</Badge>}
              </div>
            ))}
            <div className="grid gap-3 md:grid-cols-2">
              {o.cards.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between"><span className="font-mono text-lg" translate="no">{c.card_number}</span>
                      <Badge variant={c.status === "active" ? "secondary" : "destructive"}>{CARD_STATUS_LABEL[c.status] ?? c.status}</Badge></div>
                    <div className="text-sm text-muted-foreground">{c.holder_name ?? "—"} · expire le {fmtDate(c.expires_on)}</div>
                    <div className="text-sm">Conducteur : {driverName(c.driver_id)} · Véhicule : <span translate="no">{plate(c.vehicle_id)}</span></div>
                    {Number(c.allocated_limit) > 0 && <div className="text-sm">Reste sur la carte : <strong className="tabular-nums">{money(c.remaining)}</strong> / {money(c.allocated_limit)}</div>}
                    {canManage && <div className="flex flex-wrap gap-2 pt-1">
                      {c.status === "active" && <Button size="sm" variant="destructive" onClick={() => setBlockCard(c)}><Ban className="mr-1 h-4 w-4" />Bloquer</Button>}
                      {c.status === "active" && <Button size="sm" variant="outline" onClick={() => { setAssign(c); setAssignForm({ driver_id: c.driver_id ?? "", vehicle_id: c.vehicle_id ?? "" }); }}><UserRound className="mr-1 h-4 w-4" />Attribuer</Button>}
                      {c.status === "blocked" && <Button size="sm" variant="outline" onClick={() => setRequest({ kind: "card_unblock", amount: "", card_id: c.id, message: "" })}>Demander le déblocage</Button>}
                    </div>}
                  </CardContent>
                </Card>
              ))}
            </div>
            {!o.cards.length && <p className="py-6 text-center text-muted-foreground">Aucune carte carburant.</p>}
          </TabsContent>}

          {o.modules.cards && <TabsContent value="fleet" className="grid gap-4 md:grid-cols-2">
            {(["driver", "vehicle"] as const).map((kind) => {
              const rows = kind === "driver" ? o.drivers : o.vehicles;
              return (
                <Card key={kind}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">{kind === "driver" ? "Conducteurs" : "Véhicules"}</CardTitle>
                    {canManage && o.accounts.length > 0 && <Button size="sm" variant="outline" onClick={() => { setAdding(kind); setAddForm({ account_id: o.accounts[0].id, name: "", phone: "", plate: "", description: "" }); }}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>}
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
                        <div>
                          <div className={r.active ? "font-medium" : "font-medium text-muted-foreground line-through"} translate={kind === "vehicle" ? "no" : undefined}>{"name" in r ? r.name : r.plate}</div>
                          <div className="text-xs text-muted-foreground">{"phone" in r ? (r.phone ?? "—") : (r.description ?? "—")}</div>
                        </div>
                        {canManage ? <label className="flex items-center gap-2 text-xs"><Switch checked={r.active} disabled={busy}
                          onCheckedChange={(v) => void act(kind === "driver" ? "set_driver" : "set_vehicle", { id: r.id, active: v }, v ? "Réactivé" : "Désactivé")} />Actif</label>
                          : <Badge variant={r.active ? "secondary" : "outline"}>{r.active ? "Actif" : "Inactif"}</Badge>}
                      </div>
                    ))}
                    {!rows.length && <p className="py-4 text-sm text-muted-foreground">Aucun enregistrement.</p>}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>}

          <TabsContent value="invoices" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" variant="outline" disabled={!o.invoices.length} onClick={exportStatement}><Download className="mr-2 h-4 w-4" />Relevé de compte (PDF)</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Facture</TableHead><TableHead>Période</TableHead><TableHead>Échéance</TableHead><TableHead className="text-right">Montant</TableHead><TableHead className="text-right">Reste dû</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
                <TableBody>
                  {o.invoices.map((i) => { const st = invoiceState(i, t0); return (
                    <TableRow key={`${i.source}-${i.id}`}><TableCell className="font-medium" translate="no">{i.number}</TableCell><TableCell>{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</TableCell><TableCell>{fmtDate(i.due_on)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(i.amount)}</TableCell><TableCell className="text-right tabular-nums">{money(Math.max(0, i.amount - i.paid))}</TableCell>
                      <TableCell><Badge variant={st === "paid" ? "secondary" : st === "overdue" ? "destructive" : "outline"}>{st === "paid" ? "Payée" : st === "overdue" ? "En retard" : "À régler"}</Badge></TableCell></TableRow>
                  ); })}
                  {!o.invoices.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune facture.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
            {o.payments.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-base">Paiements reçus</CardTitle></CardHeader><CardContent className="space-y-1">
              {o.payments.map((p) => <div key={p.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{fmtDate(p.paid_on)} · <span translate="no">{p.reference}</span></span><span className="tabular-nums">{money(p.amount)}</span></div>)}
            </CardContent></Card>}
          </TabsContent>

          <TabsContent value="delivery_notes"><PortalDeliveryNotes canManage={canManage} /></TabsContent>
          <TabsContent value="requests" className="grid gap-4 md:grid-cols-5">
            {canManage && <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Nouvelle demande</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1"><Label>Type</Label>
                  <Select value={request.kind} onValueChange={(v) => setRequest({ ...request, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PORTAL_REQUEST_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select></div>
                {request.kind === "credit_limit" && <div className="space-y-1"><Label>Nouveau plafond souhaité ({cur})</Label>
                  <Input type="number" min="0" inputMode="numeric" value={request.amount} onChange={(e) => setRequest({ ...request, amount: e.target.value })} />
                  {o.terms && <p className="text-xs text-muted-foreground">Plafond actuel : {money(o.terms.credit_limit)}</p>}</div>}
                {request.kind === "card_unblock" && <div className="space-y-1"><Label>Carte</Label>
                  <Select value={request.card_id} onValueChange={(v) => setRequest({ ...request, card_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir une carte bloquée" /></SelectTrigger>
                    <SelectContent>{o.cards.filter((c) => c.status === "blocked").map((c) => <SelectItem key={c.id} value={c.id}>{c.card_number} · {c.holder_name ?? ""}</SelectItem>)}</SelectContent>
                  </Select></div>}
                <div className="space-y-1"><Label>Message</Label><Textarea value={request.message} maxLength={1000} placeholder="Précisez votre demande" onChange={(e) => setRequest({ ...request, message: e.target.value })} /></div>
                <Button className="w-full" disabled={busy || request.message.trim().length < 3} onClick={submitRequest}><Send className="mr-2 h-4 w-4" />Envoyer</Button>
              </CardContent>
            </Card>}
            <Card className={canManage ? "md:col-span-3" : "md:col-span-5"}>
              <CardHeader className="pb-2"><CardTitle className="text-base">Suivi de vos demandes</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {o.requests.map((r) => (
                  <div key={r.id} className="space-y-1 border-b border-border py-3 text-sm">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{PORTAL_REQUEST_LABEL[r.kind] ?? r.kind}</span>
                      <Badge variant={r.status === "accepted" ? "secondary" : r.status === "declined" ? "destructive" : "outline"}>{PORTAL_STATUS_LABEL[r.status]}</Badge></div>
                    <div className="text-xs text-muted-foreground"><span translate="no">{r.reference}</span> · {fmtDate(r.created_at)}{r.amount != null ? ` · ${money(r.amount)}` : ""}{r.card_id ? ` · ${cardNo(r.card_id)}` : ""}</div>
                    <p className="text-muted-foreground">« {r.message} »</p>
                    {r.decision_comment && <p className="text-xs">Réponse : {r.decision_comment}</p>}
                  </div>
                ))}
                {!o.requests.length && <p className="py-4 text-sm text-muted-foreground">Aucune demande pour le moment.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {(o.tenant?.phone || o.tenant?.email) && <p className="text-center text-xs text-muted-foreground">Une question ? {o.tenant?.name} · {[o.tenant?.phone, o.tenant?.email].filter(Boolean).join(" · ")}</p>}
        {o.tenant?.show_powered_by && <p className="text-center text-[11px] text-muted-foreground/70" translate="no">{o.tenant.powered_by_label}</p>}
      </main>

      <Dialog open={!!blockCard} onOpenChange={(v) => !v && setBlockCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bloquer la carte {blockCard?.card_number} ?</DialogTitle>
            <DialogDescription>La carte sera refusée immédiatement en station. Pour la réactiver, il faudra envoyer une demande de déblocage.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setBlockCard(null)}>Annuler</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => { if (blockCard && await act("block_card", { card_id: blockCard.id }, "Carte bloquée")) setBlockCard(null); }}>Bloquer la carte</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assign} onOpenChange={(v) => !v && setAssign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attribuer la carte {assign?.card_number}</DialogTitle></DialogHeader>
          {(["driver_id", "vehicle_id"] as const).map((k) => {
            const list = k === "driver_id" ? o.drivers.filter((d) => d.active && d.account_id === assign?.account_id).map((d) => ({ id: d.id, label: d.name }))
              : o.vehicles.filter((v) => v.active && v.account_id === assign?.account_id).map((v) => ({ id: v.id, label: v.plate }));
            return <div key={k} className="space-y-1"><Label>{k === "driver_id" ? "Conducteur" : "Véhicule"}</Label>
              <Select value={assignForm[k] || "none"} onValueChange={(v) => setAssignForm({ ...assignForm, [k]: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Aucun</SelectItem>{list.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}</SelectContent>
              </Select></div>;
          })}
          <DialogFooter><Button variant="outline" onClick={() => setAssign(null)}>Annuler</Button>
            <Button disabled={busy} onClick={async () => { if (assign && await act("assign_card", { card_id: assign.id, ...assignForm }, "Carte attribuée")) setAssign(null); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adding} onOpenChange={(v) => !v && setAdding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{adding === "driver" ? "Nouveau conducteur" : "Nouveau véhicule"}</DialogTitle></DialogHeader>
          {o.accounts.length > 1 && <div className="space-y-1"><Label>Compte</Label>
            <Select value={addForm.account_id} onValueChange={(v) => setAddForm({ ...addForm, account_id: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{o.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.contract_reference ?? (a.kind === "postpaid" ? "Postpayé" : "Prépayé")}</SelectItem>)}</SelectContent></Select></div>}
          {adding === "driver" ? <>
            <div className="space-y-1"><Label>Nom complet</Label><Input value={addForm.name} maxLength={120} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Téléphone</Label><Input value={addForm.phone} maxLength={40} inputMode="tel" onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} /></div>
          </> : <>
            <div className="space-y-1"><Label>Immatriculation</Label><Input value={addForm.plate} maxLength={30} onChange={(e) => setAddForm({ ...addForm, plate: e.target.value })} /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={addForm.description} maxLength={120} placeholder="Ex. camion-citerne 30 000 L" onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} /></div>
          </>}
          <DialogFooter><Button variant="outline" onClick={() => setAdding(null)}>Annuler</Button>
            <Button disabled={busy} onClick={async () => { if (await act(adding === "driver" ? "add_driver" : "add_vehicle", addForm, "Enregistré")) setAdding(null); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientPortal;
