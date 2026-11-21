import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, Plus, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lineAmounts, orderCounters, proformaTotals, sumCounters, type PaymentStatus } from "@/lib/depotSupply";
import { jsPDF } from "@/lib/pdf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fmt = (v: number, d = 0) => Number(v || 0).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/[\u202f\u00a0]/g, " ");
const STATUS: Record<PaymentStatus, { fr: string; en: string; variant: "destructive" | "default" | "secondary" }> = {
  pret_credit: { fr: "PRÊT / CRÉDIT", en: "LOAN / CREDIT", variant: "default" },
  paiement_direct: { fr: "PAIEMENT DIRECT", en: "DIRECT PAYMENT", variant: "secondary" },
  non_paye: { fr: "NON PAYÉ", en: "UNPAID", variant: "destructive" },
};
const emptyLine = () => ({ product_id: "", qty_litres: "", unit_price: "", tax_rate: "0" });

/** 1. Approvisionnement dépôt : pro-formas → bons de commande → statut de règlement (écritures via depot_supply_action). */
export const DepotSupplyTab = ({ canWrite, canValidate }: { canWrite: boolean; canValidate: boolean }) => {
  const { language } = useLanguage();
  const L = (fr: string, en: string) => (language === "en" ? en : fr);
  const { scopeQuery, tenantId, countryId } = useScope();
  const brand = useBranding();
  const [ref, setRef] = useState<Record<string, Row[]>>({});
  const [proformas, setProformas] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openPf, setOpenPf] = useState(false);
  const [pf, setPf] = useState<Row>({});
  const [lines, setLines] = useState([emptyLine()]);
  const [issueFor, setIssueFor] = useState<Row | null>(null);
  const [benef, setBenef] = useState<{ client_id: string; name: string }>({ client_id: "", name: "" });
  const [statusFor, setStatusFor] = useState<{ order: Row; status: PaymentStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [s, dp, p, c, f] = await Promise.all([
      scopeQuery(db.from("suppliers").select("id,name")).order("name"),
      scopeQuery(db.from("depots").select("id,name")).order("name"),
      scopeQuery(db.from("petroleum_products").select("id,name")).order("name"),
      scopeQuery(db.from("clients").select("id,name")).order("name"),
      scopeQuery(db.from("depot_proformas").select("*, suppliers(name), depots(name), depot_proforma_lines(*, petroleum_products(name)), depot_purchase_orders(*)"))
        .order("proforma_date", { ascending: false }).limit(500),
    ]);
    setLoading(false);
    if (f.error) toast.error(f.error.message);
    setRef({ suppliers: s.data ?? [], depots: dp.data ?? [], products: p.data ?? [], clients: c.data ?? [] });
    setProformas((f.data ?? []).map((x: Row) => ({ ...x, order: Array.isArray(x.depot_purchase_orders) ? x.depot_purchase_orders[0] : x.depot_purchase_orders })));
  }, [tenantId, countryId, scopeQuery]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, data: Row, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("depot_supply_action", { _action: action, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return true;
  };

  const numLines = lines.map((l) => ({ ...l, qty_litres: Number(l.qty_litres) || 0, unit_price: Number(l.unit_price) || 0, tax_rate: Number(l.tax_rate) || 0 }));
  const draftTotals = proformaTotals(numLines);
  const counters = useMemo(() => proformas.map((p) => orderCounters(p.depot_proforma_lines ?? [], p.order?.payment_status)), [proformas]);
  const total = sumCounters(counters);

  const savePf = async () => {
    if (!pf.number || !pf.proforma_date) return toast.error(L("Numéro et date obligatoires", "Number and date required"));
    if (numLines.some((l) => !l.product_id || l.qty_litres <= 0)) return toast.error(L("Chaque ligne doit avoir un produit et une quantité", "Each line needs a product and quantity"));
    if (await act("create_proforma", { ...pf, tenant_id: tenantId, country_id: countryId, lines: numLines }, L("Pro-forma enregistré", "Pro-forma saved"))) {
      setOpenPf(false); setPf({}); setLines([emptyLine()]);
    }
  };

  const openHistory = async (o: Row) => {
    setHistory(o);
    const { data } = await db.from("depot_purchase_order_events").select("*").eq("order_id", o.id).order("created_at");
    setEvents(data ?? []);
  };

  const pdfOrder = (p: Row) => {
    const o = p.order; const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(); let y = 18;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(`BON DE COMMANDE N° ${o.number}`, W / 2, y, { align: "center" }); y += 9;
    doc.setFontSize(9.5); doc.setFont("helvetica", "normal");
    const info: [string, string][] = [
      ["Émetteur", brand.legalName || brand.companyName], ["Date d'émission", new Date(o.issue_date).toLocaleDateString("fr-FR")],
      ["Fournisseur", p.suppliers?.name ?? "—"], ["Dépôt de chargement", p.depots?.name ?? "—"],
      ["Client bénéficiaire", o.beneficiary_name], ["Réf. pro-forma", `${p.number} du ${new Date(p.proforma_date).toLocaleDateString("fr-FR")}`],
      ["Statut de règlement", STATUS[o.payment_status as PaymentStatus].fr],
    ];
    info.forEach(([k, v]) => { doc.setFont("helvetica", "bold"); doc.text(`${k} :`, 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v), 60, y); y += 6; });
    y += 3;
    const cols = [14, 70, 100, 130, 148, 172]; const head = ["Produit", "Quantité (L)", "Prix unit.", "Taxe %", "Montant HT", "Montant TTC"];
    doc.setFillColor(230, 230, 230); doc.rect(12, y - 5, W - 24, 7, "F"); doc.setFont("helvetica", "bold");
    head.forEach((h, i) => doc.text(h, cols[i], y)); y += 7; doc.setFont("helvetica", "normal");
    (p.depot_proforma_lines ?? []).forEach((l: Row) => {
      [l.petroleum_products?.name ?? "—", fmt(l.qty_litres), fmt(l.unit_price, 2), fmt(l.tax_rate, 2), fmt(l.amount_ht), fmt(l.amount_ttc)].forEach((v, i) => doc.text(String(v), cols[i], y));
      doc.line(12, y + 2, W - 12, y + 2); y += 7;
    });
    y += 2; doc.setFont("helvetica", "bold");
    [["Total HT", p.total_ht], ["Taxes", p.total_tax], ["Total TTC", p.total_ttc]].forEach(([k, v]) => { doc.text(String(k), 130, y); doc.text(`${fmt(Number(v))} FCFA`, W - 14, y, { align: "right" }); y += 6; });
    y += 14; doc.setFont("helvetica", "normal");
    doc.text("Le Responsable Logistique", 20, y); doc.text("La Direction", W - 60, y);
    doc.save(`${o.number}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {([[L("Qté commandée", "Ordered"), total.ordered], [L("Qté autorisée", "Authorized"), total.authorized], [L("Qté enlevée", "Lifted"), total.lifted], [L("Disponible à l'enlèvement", "Available to lift"), total.available]] as [string, number][]).map(([l, v]) => (
          <Card key={l} className="glass-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            {loading ? <Skeleton className="h-8 w-24 mt-1" /> : <div className="text-2xl font-bold font-display">{fmt(v)} L</div>}
          </CardContent></Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{L("Un pro-forma seul n'autorise jamais d'enlèvement : seul un bon de commande en PRÊT / CRÉDIT ou PAIEMENT DIRECT libère la quantité.", "A pro-forma alone never authorizes lifting: only a purchase order on LOAN / CREDIT or DIRECT PAYMENT releases the quantity.")}</p>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{L("Pro-formas & bons de commande", "Pro-formas & purchase orders")}</CardTitle>
          {canWrite && <Button size="sm" onClick={() => setOpenPf(true)}><Plus className="h-4 w-4 mr-1" />{L("Nouveau pro-forma", "New pro-forma")}</Button>}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("Pro-forma", "Pro-forma")}</TableHead><TableHead>{L("Fournisseur / dépôt", "Supplier / depot")}</TableHead>
              <TableHead>{L("Produits", "Products")}</TableHead><TableHead className="text-right">TTC</TableHead>
              <TableHead>{L("Bon de commande", "Purchase order")}</TableHead><TableHead>{L("Règlement", "Payment")}</TableHead>
              <TableHead className="text-right">{L("Disponible", "Available")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {proformas.length === 0 && !loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{L("Aucun pro-forma enregistré", "No pro-forma yet")}</TableCell></TableRow>}
              {proformas.map((p, i) => {
                const o = p.order; const expired = p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10);
                return (
                  <TableRow key={p.id}>
                    <TableCell><div className="font-medium">{p.number}</div><div className="text-xs text-muted-foreground">{new Date(p.proforma_date).toLocaleDateString("fr-FR")}{p.valid_until && <> → {new Date(p.valid_until).toLocaleDateString("fr-FR")}</>} {expired && !o && <Badge variant="outline" className="ml-1">{L("expiré", "expired")}</Badge>}</div></TableCell>
                    <TableCell><div>{p.suppliers?.name ?? "—"}</div><div className="text-xs text-muted-foreground">{p.depots?.name ?? "—"}</div></TableCell>
                    <TableCell className="text-xs">{(p.depot_proforma_lines ?? []).map((l: Row) => <div key={l.id}>{l.petroleum_products?.name} · {fmt(l.qty_litres)} L</div>)}</TableCell>
                    <TableCell className="text-right">{fmt(p.total_ttc)}</TableCell>
                    <TableCell>{o ? <button className="underline text-sm" onClick={() => openHistory(o)}>{o.number}</button> : canValidate ? <Button size="sm" variant="outline" disabled={busy} onClick={() => { setIssueFor(p); setBenef({ client_id: "", name: brand.legalName || brand.companyName || "" }); }}><FileText className="h-4 w-4 mr-1" />{L("Émettre BC", "Issue PO")}</Button> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell>{o && (
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(STATUS) as PaymentStatus[]).map((s) => (
                          <Button key={s} size="sm" variant={o.payment_status === s ? (STATUS[s].variant === "destructive" ? "destructive" : "default") : "outline"} className="h-7 px-2 text-[11px]"
                            disabled={!canValidate || busy || o.payment_status === s} onClick={() => { setStatusFor({ order: o, status: s }); setReason(""); }}>
                            {language === "en" ? STATUS[s].en : STATUS[s].fr}
                          </Button>
                        ))}
                      </div>)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(counters[i]?.available ?? 0)} L</TableCell>
                    <TableCell>{o && <Button size="icon" variant="ghost" title="PDF" onClick={() => pdfOrder(p)}><FileDown className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openPf} onOpenChange={setOpenPf}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{L("Enregistrer un pro-forma dépôt", "Record a depot pro-forma")}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>{L("Fournisseur", "Supplier")}</Label>
              <Select value={pf.supplier_id ?? ""} onValueChange={(v) => setPf({ ...pf, supplier_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(ref.suppliers ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{L("Dépôt de chargement prévu", "Planned loading depot")}</Label>
              <Select value={pf.depot_id ?? ""} onValueChange={(v) => setPf({ ...pf, depot_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(ref.depots ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{L("N° pro-forma", "Pro-forma no.")}</Label><Input value={pf.number ?? ""} onChange={(e) => setPf({ ...pf, number: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{L("Date", "Date")}</Label><Input type="date" value={pf.proforma_date ?? ""} onChange={(e) => setPf({ ...pf, proforma_date: e.target.value })} /></div>
              <div><Label>{L("Validité", "Valid until")}</Label><Input type="date" value={pf.valid_until ?? ""} min={pf.proforma_date} onChange={(e) => setPf({ ...pf, valid_until: e.target.value })} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{L("Lignes produits", "Product lines")}</Label>
            {lines.map((l, i) => {
              const a = lineAmounts(numLines[i]);
              const set = (k: string, v: string) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3"><Select value={l.product_id} onValueChange={(v) => set("product_id", v)}><SelectTrigger><SelectValue placeholder={L("Produit", "Product")} /></SelectTrigger>
                    <SelectContent>{(ref.products ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                  <Input className="col-span-2" type="number" min={0} placeholder={L("Litres", "Litres")} value={l.qty_litres} onChange={(e) => set("qty_litres", e.target.value)} />
                  <Input className="col-span-2" type="number" min={0} placeholder={L("Prix unit.", "Unit price")} value={l.unit_price} onChange={(e) => set("unit_price", e.target.value)} />
                  <Input className="col-span-1" type="number" min={0} max={100} placeholder="%" value={l.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} />
                  <div className="col-span-3 text-xs text-right">HT {fmt(a.amount_ht)}<br />TTC <b>{fmt(a.amount_ttc)}</b></div>
                  <Button className="col-span-1" size="icon" variant="ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, emptyLine()])}><Plus className="h-4 w-4 mr-1" />{L("Ajouter une ligne", "Add line")}</Button>
            <div className="text-right text-sm">HT {fmt(draftTotals.amount_ht)} · {L("Taxes", "Taxes")} {fmt(draftTotals.tax_amount)} · <b>TTC {fmt(draftTotals.amount_ttc)} FCFA</b></div>
          </div>
          <div><Label>{L("Observations", "Notes")}</Label><Textarea value={pf.observations ?? ""} onChange={(e) => setPf({ ...pf, observations: e.target.value })} /></div>
          <DialogFooter><Button disabled={busy} onClick={savePf}>{L("Enregistrer", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issueFor} onOpenChange={(o) => !o && setIssueFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Émettre le bon de commande", "Issue purchase order")} — {issueFor?.number}</DialogTitle></DialogHeader>
          <div><Label>{L("Client bénéficiaire (facultatif)", "Beneficiary client (optional)")}</Label>
            <Select value={benef.client_id || "self"} onValueChange={(v) => setBenef(v === "self" ? { client_id: "", name: brand.legalName || brand.companyName || "" } : { client_id: v, name: (ref.clients ?? []).find((c) => c.id === v)?.name ?? "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="self">{L("Notre entreprise", "Our company")}</SelectItem>{(ref.clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label>{L("Nom du bénéficiaire", "Beneficiary name")}</Label><Input value={benef.name} onChange={(e) => setBenef({ ...benef, name: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">{L("Le BC est créé en statut NON PAYÉ : la quantité reste bloquée jusqu'au choix du règlement.", "The PO starts as UNPAID: quantity stays blocked until payment is set.")}</p>
          <DialogFooter><Button disabled={busy || !benef.name.trim()} onClick={async () => { if (await act("issue_order", { proforma_id: issueFor!.id, client_id: benef.client_id || null, beneficiary_name: benef.name }, L("Bon de commande émis", "Purchase order issued"))) setIssueFor(null); }}>{L("Émettre", "Issue")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusFor} onOpenChange={(o) => !o && setStatusFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Changer le statut de règlement", "Change payment status")}</DialogTitle></DialogHeader>
          {statusFor && <p className="text-sm">{statusFor.order.number} : {STATUS[statusFor.order.payment_status as PaymentStatus].fr} → <b>{STATUS[statusFor.status].fr}</b></p>}
          <div><Label>{L("Commentaire (facultatif)", "Comment (optional)")}</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button disabled={busy} onClick={async () => { if (await act("set_payment_status", { order_id: statusFor!.order.id, status: statusFor!.status, reason }, L("Statut enregistré", "Status saved"))) setStatusFor(null); }}>{L("Confirmer", "Confirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Historique", "History")} — {history?.number}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            {events.map((e) => (
              <div key={e.id} className="border-b border-border pb-2">
                <div className="font-medium">{e.action === "issue" ? L("Émission", "Issued") : `${e.from_status ? STATUS[e.from_status as PaymentStatus]?.fr : ""} → ${STATUS[e.to_status as PaymentStatus]?.fr}`}</div>
                <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR")} · {e.author_name ?? "—"}{e.reason && ` · ${e.reason}`}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
