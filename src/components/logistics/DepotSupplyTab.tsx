import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, Plus, Trash2, FileText, Pencil, FileSpreadsheet } from "lucide-react";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { useBranding } from "@/hooks/useBranding";
import { usePermissions } from "@/hooks/usePermissions";
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
import { isEditableOrder, lineAmounts, orderCounters, productCounters, proformaTotals, type PaymentStatus } from "@/lib/depotSupply";
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
  const { can } = usePermissions();
  const [ref, setRef] = useState<Record<string, Row[]>>({});
  const [proformas, setProformas] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openPf, setOpenPf] = useState(false);
  const [direct, setDirect] = useState(false);
  const [pf, setPf] = useState<Row>({});
  const [lines, setLines] = useState([emptyLine()]);
  const [issueFor, setIssueFor] = useState<Row | null>(null);
  const [benef, setBenef] = useState<{ client_id: string; name: string }>({ client_id: "", name: "" });
  const [statusFor, setStatusFor] = useState<{ order: Row; status: PaymentStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [s, dp, p, c, f] = await Promise.all([
      scopeQuery(db.from("suppliers").select("id,name")).order("name"),
      scopeQuery(db.from("depots").select("id,name")).order("name"),
      scopeQuery(db.from("petroleum_products").select("id,name")).order("name"),
      scopeQuery(db.from("clients").select("id,name")).order("name"),
      scopeQuery(db.from("depot_proformas").select("*, suppliers(name), depots(name), depot_proforma_lines(*, petroleum_products(name)), depot_purchase_orders(*, depot_lifting_orders(id))"))
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
    const { data: id, error } = await db.rpc("depot_supply_action", { _action: action, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return (id as string) || true;
  };

  const numLines = lines.map((l) => ({ ...l, qty_litres: Number(l.qty_litres) || 0, unit_price: Number(l.unit_price) || 0, tax_rate: Number(l.tax_rate) || 0 }));
  const draftTotals = proformaTotals(numLines);
  const counters = useMemo(() => proformas.map((p) => orderCounters(p.depot_proforma_lines ?? [], p.order?.payment_status)), [proformas]);
  const byProduct = useMemo(() => productCounters(proformas.map((p) => ({ status: p.order?.payment_status, lines: (p.depot_proforma_lines ?? []).map((l: Row) => ({ ...l, product_name: l.petroleum_products?.name })) }))), [proformas]);
  const editable = (p: Row) => isEditableOrder((p.order?.depot_lifting_orders ?? []).length, p.depot_proforma_lines ?? []);
  const startEdit = (p: Row) => {
    setEditId(p.id); setDirect(false);
    setPf({ supplier_id: p.supplier_id, depot_id: p.depot_id, number: p.number, proforma_date: p.proforma_date, valid_until: p.valid_until ?? "", observations: p.observations ?? "" });
    setLines((p.depot_proforma_lines ?? []).map((l: Row) => ({ product_id: l.product_id, qty_litres: String(l.qty_litres), unit_price: String(l.unit_price), tax_rate: String(l.tax_rate) })));
    setBenef({ client_id: p.order?.beneficiary_client_id ?? "", name: p.order?.beneficiary_name ?? "" });
    setOpenPf(true);
  };
  const editRpc = async (action: "update" | "delete", data: Row, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("depot_po_edit", { _action: action, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return true;
  };
  const removePf = async (p: Row) => {
    if (!window.confirm(L(`Supprimer définitivement ${p.order ? "le bon de commande " + p.order.number + " et " : ""}le pro-forma ${p.number} ?`, `Permanently delete ${p.order ? "PO " + p.order.number + " and " : ""}pro-forma ${p.number}?`))) return;
    await editRpc("delete", { proforma_id: p.id }, L("Supprimé", "Deleted"));
  };
  const rowsForExport = () => proformas.flatMap((p) => (p.depot_proforma_lines ?? []).map((l: Row) => ({
    bc: p.order?.number ?? "", date: p.order?.issue_date ?? p.proforma_date, pf: p.number, fournisseur: p.suppliers?.name ?? "", depot: p.depots?.name ?? "",
    beneficiaire: p.order?.beneficiary_name ?? "", produit: l.petroleum_products?.name ?? "", qte: Number(l.qty_litres), enleve: Number(l.qty_lifted || 0),
    pu: Number(l.unit_price), ttc: Number(l.amount_ttc), statut: p.order ? STATUS[p.order.payment_status as PaymentStatus].fr : "Pro-forma",
  })));
  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Bons de commande");
    ws.columns = [["N° BC","bc",16],["Date","date",12],["Pro-forma","pf",14],["Fournisseur","fournisseur",20],["Dépôt","depot",18],["Bénéficiaire","beneficiaire",22],["Produit","produit",14],["Quantité (L)","qte",14],["Enlevé (L)","enleve",14],["Prix unit.","pu",12],["Montant TTC","ttc",16],["Statut","statut",18]].map(([header,key,width]) => ({ header: header as string, key: key as string, width: width as number }));
    ws.getRow(1).font = { bold: true };
    rowsForExport().forEach((r) => ws.addRow(r));
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bons-de-commande-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
  };
  const exportPdfList = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }); const W = doc.internal.pageSize.getWidth(); let y = 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("LISTE DES BONS DE COMMANDE", W / 2, y, { align: "center" }); y += 8;
    doc.setFontSize(8.5);
    const cols = [10, 38, 60, 100, 140, 170, 200, 225, 250]; const head = ["N° BC", "Date", "Fournisseur", "Bénéficiaire", "Produit", "Qté (L)", "Enlevé (L)", "TTC", "Statut"];
    const header = () => { doc.setFont("helvetica", "bold"); doc.setFillColor(230, 230, 230); doc.rect(8, y - 4.5, W - 16, 6.5, "F"); head.forEach((h, i) => doc.text(h, cols[i], y)); y += 6.5; doc.setFont("helvetica", "normal"); };
    header();
    rowsForExport().forEach((r) => {
      if (y > 195) { doc.addPage(); y = 16; header(); }
      [r.bc || "—", new Date(r.date).toLocaleDateString("fr-FR"), r.fournisseur.slice(0, 22), r.beneficiaire.slice(0, 24), r.produit, fmt(r.qte), fmt(r.enleve), fmt(r.ttc), r.statut].forEach((v, i) => doc.text(String(v), cols[i], y));
      y += 5.5;
    });
    y += 4; doc.setFont("helvetica", "bold");
    byProduct.forEach((c) => { if (y > 200) { doc.addPage(); y = 16; } doc.text(`${c.product_name} : commandé ${fmt(c.ordered)} L · autorisé ${fmt(c.authorized)} L · enlevé ${fmt(c.lifted)} L · disponible ${fmt(c.available)} L`, 10, y); y += 5.5; });
    doc.save(`bons-de-commande-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const savePf = async () => {
    if (!pf.number || !pf.proforma_date) return toast.error(L("Numéro et date obligatoires", "Number and date required"));
    if (numLines.some((l) => !l.product_id || l.qty_litres <= 0)) return toast.error(L("Chaque ligne doit avoir un produit et une quantité", "Each line needs a product and quantity"));
    if (direct && !benef.name.trim()) return toast.error(L("Nom du bénéficiaire obligatoire", "Beneficiary name required"));
    if (editId) {
      if (await editRpc("update", { ...pf, proforma_id: editId, lines: numLines, client_id: benef.client_id || null, beneficiary_name: benef.name }, L("Modifications enregistrées", "Changes saved"))) { setOpenPf(false); setEditId(null); setPf({}); setLines([emptyLine()]); }
      return;
    }
    const pid = await act("create_proforma", { ...pf, tenant_id: tenantId, country_id: countryId, lines: numLines }, L("Pro-forma enregistré", "Pro-forma saved"));
    if (!pid) return;
    if (direct && typeof pid === "string") {
      const oid = await act("issue_order", { proforma_id: pid, client_id: benef.client_id || null, beneficiary_name: benef.name }, L("Bon de commande émis", "Purchase order issued"));
      if (!oid) toast.info(L("Pro-forma conservé : émettez le BC depuis le tableau.", "Pro-forma kept: issue the PO from the table."));
    }
    setOpenPf(false); setPf({}); setLines([emptyLine()]); setDirect(false);
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && <Skeleton className="h-28 w-full" />}
        {!loading && byProduct.length === 0 && <Card className="glass-card"><CardContent className="p-4 text-sm text-muted-foreground">{L("Aucun produit commandé", "No product ordered")}</CardContent></Card>}
        {!loading && byProduct.map((c) => (
          <Card key={c.product_id} className="glass-card"><CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between"><span className="font-display font-semibold">{c.product_name}</span><Badge variant="secondary">{L("Disponible", "Available")} {fmt(c.available)} L</Badge></div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {([[L("Commandé", "Ordered"), c.ordered], [L("Autorisé", "Authorized"), c.authorized], [L("Enlevé", "Lifted"), c.lifted]] as [string, number][]).map(([l, v]) => (
                <div key={l}><div className="text-muted-foreground">{l}</div><div className="font-medium text-sm">{fmt(v)} L</div></div>
              ))}
            </div>
          </CardContent></Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{L("Un pro-forma seul n'autorise jamais d'enlèvement : seul un bon de commande en PRÊT / CRÉDIT ou PAIEMENT DIRECT libère la quantité.", "A pro-forma alone never authorizes lifting: only a purchase order on LOAN / CREDIT or DIRECT PAYMENT releases the quantity.")}</p>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{L("Pro-formas & bons de commande", "Pro-formas & purchase orders")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!proformas.length} onClick={exportPdfList}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
            <Button size="sm" variant="outline" disabled={!proformas.length} onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
            {canValidate && can("depot_purchases.issue_order") && can("depot_purchases.create_proforma") && <Button size="sm" onClick={() => { setEditId(null); setPf({}); setLines([emptyLine()]); setDirect(true); setBenef({ client_id: "", name: brand.legalName || brand.companyName || "" }); setOpenPf(true); }}><FileText className="h-4 w-4 mr-1" />{L("Nouveau bon de commande", "New purchase order")}</Button>}
            {canWrite && can("depot_purchases.create_proforma") && <Button size="sm" variant="outline" onClick={() => { setEditId(null); setPf({}); setLines([emptyLine()]); setDirect(false); setOpenPf(true); }}><Plus className="h-4 w-4 mr-1" />{L("Nouveau pro-forma", "New pro-forma")}</Button>}
          </div>
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
                    <TableCell>{o ? <Button variant="link" className="h-auto p-0" onClick={() => openHistory(o)}>{o.number}</Button> : canValidate && can("depot_purchases.issue_order") ? <Button size="sm" variant="outline" disabled={busy} onClick={() => { setIssueFor(p); setBenef({ client_id: "", name: brand.legalName || brand.companyName || "" }); }}><FileText className="h-4 w-4 mr-1" />{L("Émettre BC", "Issue PO")}</Button> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell>{o && (
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(STATUS) as PaymentStatus[]).map((s) => (
                          <Button key={s} size="sm" variant={o.payment_status === s ? (STATUS[s].variant === "destructive" ? "destructive" : "default") : "outline"} className="h-7 px-2 text-[11px]"
                            disabled={!canValidate || !can("depot_purchases.set_payment_status") || busy || o.payment_status === s} onClick={() => { setStatusFor({ order: o, status: s }); setReason(""); }}>
                            {language === "en" ? STATUS[s].en : STATUS[s].fr}
                          </Button>
                        ))}
                      </div>)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(counters[i]?.available ?? 0)} L</TableCell>
                    <TableCell><div className="flex">
                      {o && <Button size="icon" variant="ghost" title="PDF" onClick={() => pdfOrder(p)}><FileDown className="h-4 w-4" /></Button>}
                      {canValidate && editable(p) && <>
                        {can("depot_purchases.edit_order") && <Button size="icon" variant="ghost" title={L("Modifier", "Edit")} disabled={busy} onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>}
                        {can("depot_purchases.delete_order") && <Button size="icon" variant="ghost" title={L("Supprimer", "Delete")} disabled={busy} onClick={() => removePf(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </>}
                    </div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openPf} onOpenChange={(v) => { setOpenPf(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? L("Modifier le pro-forma / bon de commande", "Edit pro-forma / purchase order") : direct ? L("Nouveau bon de commande (à partir du pro-forma dépôt)", "New purchase order (from depot pro-forma)") : L("Enregistrer un pro-forma dépôt", "Record a depot pro-forma")}</DialogTitle></DialogHeader>
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
          {(direct || (editId && proformas.find((x) => x.id === editId)?.order)) && (
            <div className="grid gap-3 md:grid-cols-2 border-t border-border pt-3">
              <div><Label>{L("Client bénéficiaire du BC", "PO beneficiary client")}</Label>
                <Select value={benef.client_id || "self"} onValueChange={(v) => setBenef(v === "self" ? { client_id: "", name: brand.legalName || brand.companyName || "" } : { client_id: v, name: (ref.clients ?? []).find((c) => c.id === v)?.name ?? "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="self">{L("Notre entreprise", "Our company")}</SelectItem>{(ref.clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>{L("Nom du bénéficiaire", "Beneficiary name")}</Label><Input value={benef.name} onChange={(e) => setBenef({ ...benef, name: e.target.value })} /></div>
              <p className="md:col-span-2 text-xs text-muted-foreground">{L("Le BC est numéroté automatiquement et créé en NON PAYÉ ; choisissez ensuite le règlement dans le tableau.", "The PO is auto-numbered and starts UNPAID; then set payment in the table.")}</p>
            </div>
          )}
          <DialogFooter><Button disabled={busy} onClick={savePf}>{editId ? L("Enregistrer les modifications", "Save changes") : direct ? L("Enregistrer et émettre le BC", "Save and issue PO") : L("Enregistrer", "Save")}</Button></DialogFooter>
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
                <div className="font-medium">{e.action === "issue" ? L("Émission", "Issued") : e.action === "edit" ? L("Modification", "Edited") : `${e.from_status ? STATUS[e.from_status as PaymentStatus]?.fr : ""} → ${STATUS[e.to_status as PaymentStatus]?.fr}`}</div>
                <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR")} · {e.author_name ?? "—"}{e.reason && ` · ${e.reason}`}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
