import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExcelJS from "exceljs";
import { jsPDF } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { execution, lossBy, rotation, stockSheet, type SheetLine } from "@/lib/logisticsKpis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const h = (n: number | null) => (n === null ? "—" : n >= 48 ? `${(n / 24).toFixed(1)} j` : `${n.toFixed(1)} h`);
const today = new Date().toISOString().slice(0, 10);
const first = today.slice(0, 8) + "01";

interface Props { d: Record<string, Row[]>; L: (fr: string, en: string) => string }

export const LogisticsDashboardTab = ({ d, L }: Props) => {
  const { scopeQuery } = useScope();
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const [product, setProduct] = useState("all");
  const [pf, setPf] = useState<Row[]>([]);
  const [lines, setLines] = useState<Row[]>([]);
  const [dis, setDis] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  useEffect(() => {
    scopeQuery(db.from("depot_proforma_lines").select("proforma_id,product_id,qty_litres,depot_proformas(depot_purchase_orders(number,issue_date))")).then((r: Row) => setPf(r.data ?? []));
    scopeQuery(db.from("depot_lifting_lines").select("lifting_id,product_id,qty_litres")).then((r: Row) => setLines(r.data ?? []));
    scopeQuery(db.from("logistics_discharges").select("trip_id,product_id,station_id,qty_bl,qty_measured,created_at")).then((r: Row) => setDis(r.data ?? []));
    scopeQuery(db.from("logistics_delivery_notes").select("trip_id,number,created_at")).then((r: Row) => setNotes(r.data ?? []));
  }, [scopeQuery]);

  const inP = (s?: string | null) => !!s && s.slice(0, 10) >= from && s.slice(0, 10) <= to;
  const pOk = (id: string) => product === "all" || id === product;
  const name = (k: string, id: string) => { const x = (d[k] ?? []).find((r) => r.id === id); return x?.name ?? x?.registration ?? x?.full_name ?? "—"; };
  const prod = (id: string) => name("products", id);

  const m = useMemo(() => {
    const liftings = (d.liftings ?? []).filter((b) => b.status !== "cancelled");
    const sheet: SheetLine[] = [];
    for (const l of pf) {
      const po = [l.depot_proformas?.depot_purchase_orders].flat()[0];
      if (po) sheet.push({ date: po.issue_date ?? "", kind: "order", ref: po.number, product_id: l.product_id, qty: Number(l.qty_litres) });
    }
    for (const l of lines) {
      const b = liftings.find((x) => x.id === l.lifting_id);
      if (b && b.status === "signed") sheet.push({ date: (b.signed_at ?? b.created_at).slice(0, 10), kind: "lifting", ref: b.number, product_id: l.product_id, qty: Number(l.qty_litres) });
    }
    for (const x of dis) sheet.push({ date: x.created_at.slice(0, 10), kind: "discharge", ref: (d.trips ?? []).find((t) => t.id === x.trip_id)?.reference ?? "—", product_id: x.product_id, qty: Number(x.qty_bl) });
    const filtered = sheet.filter((s) => pOk(s.product_id));
    const full = stockSheet(filtered);
    const period = full.filter((s) => s.date >= from && s.date <= to);
    const sum = (k: SheetLine["kind"]) => period.filter((s) => s.kind === k).reduce((a, s) => a + s.qty, 0);
    const pDis = dis.filter((x) => inP(x.created_at) && pOk(x.product_id));
    const trips = (d.trips ?? []).filter((t) => inP(t.loaded_at ?? t.created_at)) as never[];
    return { full, period, last: full.at(-1), exec: execution(sum("order"), sum("lifting"), sum("discharge")), rot: rotation(liftings as never, trips, pDis as never),
      byCarrier: lossBy(pDis as never, d.trips as never ?? [], "carrier_id"), byTruck: lossBy(pDis as never, d.trips as never ?? [], "truck_id"), byDriver: lossBy(pDis as never, d.trips as never ?? [], "driver_id") };
  }, [d, pf, lines, dis, from, to, product]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = { order: L("Bon de commande", "Purchase order"), lifting: L("Enlèvement (BE)", "Lifting"), delivery_note: "BL", discharge: L("Dépotage cuve", "Tank discharge") };

  const sections = () => {
    const pn = product === "all" ? L("Tous produits", "All products") : prod(product);
    const lossRows = (rows: ReturnType<typeof lossBy>, k: string) => rows.map((r) => [r.id === "—" ? "—" : name(k, r.id), fmt(r.bl), fmt(r.measured), `${fmt(r.loss)} (${r.lossPct.toFixed(2)} %)`]);
    const lossHead = [L("Nom", "Name"), "BL (L)", L("Jaugé (L)", "Measured"), L("Perte L (%)", "Loss L (%)")];
    return { pn, list: [
      { t: L("Synthèse des 3 stocks", "3-stock summary"), head: [L("Indicateur", "Indicator"), L("Valeur", "Value")], rows: [
        [L("Commandé non enlevé", "Ordered not lifted"), `${fmt(m.last?.notLifted ?? 0)} L`], [L("En transit", "In transit"), `${fmt(m.last?.transit ?? 0)} L`],
        [L("Réceptionné en cuves", "Received"), `${fmt(m.last?.received ?? 0)} L`], [L("Commandé (période)", "Ordered"), `${fmt(m.exec.ordered)} L`],
        [L("Taux d'enlèvement", "Lifted rate"), `${m.exec.liftedPct.toFixed(0)} %`], [L("Taux de livraison", "Delivered rate"), `${m.exec.deliveredPct.toFixed(0)} %`]] },
      { t: L("Délais moyens", "Average delays"), head: [L("Étape", "Step"), L("Durée", "Duration")], rows: [
        [L("BE → chargement", "LO → loaded"), h(m.rot.beToLoad)], [L("Chargement → départ", "Loaded → departed"), h(m.rot.loadToDepart)], [L("Transit", "Transit"), h(m.rot.transit)],
        [L("Livraison → dépotage", "Delivered → discharge"), h(m.rot.toDischarge)], [L("Rotation totale", "Total rotation"), h(m.rot.total)]] },
      { t: L("Freinte par transporteur", "Loss by carrier"), head: lossHead, rows: lossRows(m.byCarrier, "carriers") },
      { t: L("Freinte par camion", "Loss by truck"), head: lossHead, rows: lossRows(m.byTruck, "vehicles") },
      { t: L("Freinte par chauffeur", "Loss by driver"), head: lossHead, rows: lossRows(m.byDriver, "drivers") },
      { t: L("Fiche de mouvements de stock", "Stock movement sheet"), head: ["Date", L("Opération", "Operation"), L("Référence", "Reference"), L("Produit", "Product"), L("Qté", "Qty"), L("Non enlevé", "Not lifted"), L("Transit", "Transit"), L("Réceptionné", "Received")],
        rows: m.period.map((x) => [x.date.split("-").reverse().join("/"), kind[x.kind], x.ref, prod(x.product_id), fmt(x.qty), fmt(x.notLifted), fmt(x.transit), fmt(x.received)]) },
    ] };
  };
  const period = `${from.split("-").reverse().join("/")} – ${to.split("-").reverse().join("/")}`;
  const exportPdf = () => {
    const { pn, list } = sections();
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" }); const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); let y = 34;
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(L("TABLEAU DE BORD LOGISTIQUE & FICHES DE STOCK", "LOGISTICS DASHBOARD & STOCK SHEETS"), W / 2, y, { align: "center" }); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`${L("Période", "Period")} : ${period} · ${L("Produit", "Product")} : ${pn}`, W / 2, y, { align: "center" }); y += 8;
    for (const sec of list) {
      const cw = (W - 24) / sec.head.length;
      if (y > H - 40) { doc.addPage(); y = 34; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(sec.t, 12, y); y += 5; doc.setFontSize(8);
      doc.setFillColor(230, 230, 230); doc.rect(12, y - 4, W - 24, 6, "F"); sec.head.forEach((c, i) => doc.text(c, 14 + i * cw, y)); y += 6; doc.setFont("helvetica", "normal");
      if (sec.rows.length === 0) { doc.text(L("Aucune donnée", "No data"), 14, y); y += 6; }
      for (const r of sec.rows) { if (y > H - 22) { doc.addPage(); y = 34; } r.forEach((c, i) => doc.text(String(c).slice(0, 40), 14 + i * cw, y)); doc.line(12, y + 1.5, W - 12, y + 1.5); y += 5.5; }
      y += 5;
    }
    doc.save(`tableau-de-bord-logistique_${from}_${to}.pdf`);
  };
  const exportXlsx = async () => {
    const { pn, list } = sections();
    const wb = new ExcelJS.Workbook();
    for (const sec of list) {
      const ws = wb.addWorksheet(sec.t.slice(0, 31));
      ws.addRow([sec.t]).font = { bold: true, size: 12 }; ws.addRow([`${L("Période", "Period")} : ${period} · ${L("Produit", "Product")} : ${pn}`]); ws.addRow([]);
      ws.addRow(sec.head).font = { bold: true }; sec.rows.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c) => { c.width = 20; });
    }
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tableau-de-bord-logistique_${from}_${to}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
  };
  const Kpi = ({ t, v, s }: { t: string; v: string; s?: string }) => <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t}</p><p className="text-2xl font-bold">{v}</p>{s && <p className="text-xs text-muted-foreground">{s}</p>}</CardContent></Card>;
  const LossTable = ({ title, rows, k }: { title: string; rows: ReturnType<typeof lossBy>; k: string }) => (
    <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">{rows.length === 0 ? <p className="text-xs text-muted-foreground">{L("Aucun dépotage sur la période.", "No discharge in period.")}</p> : (
        <Table><TableHeader><TableRow><TableHead>{L("Nom", "Name")}</TableHead><TableHead className="text-right">BL</TableHead><TableHead className="text-right">{L("Jaugé", "Measured")}</TableHead><TableHead className="text-right">{L("Perte", "Loss")}</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => <TableRow key={r.id}><TableCell>{r.id === "—" ? "—" : name(k, r.id)}</TableCell><TableCell className="text-right">{fmt(r.bl)}</TableCell><TableCell className="text-right">{fmt(r.measured)}</TableCell>
            <TableCell className={`text-right ${r.lossPct > 0.5 ? "text-destructive font-semibold" : ""}`}>{fmt(r.loss)} L ({r.lossPct.toFixed(2)} %)</TableCell></TableRow>)}</TableBody></Table>)}</CardContent></Card>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><Label className="text-xs">{L("Du", "From")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">{L("Au", "To")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><Label className="text-xs">{L("Produit", "Product")}</Label>
          <Select value={product} onValueChange={setProduct}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{L("Tous", "All")}</SelectItem>{(d.products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end gap-2">
          <Button variant="outline" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
          <Button variant="outline" onClick={exportPdf}><FileText className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{L("Lecture seule : aucun stock n'est modifié. Commandé = BC émis ; enlevé = BE signés ; réceptionné = dépotages en cuve (volume BL).", "Read-only. Ordered = POs; lifted = signed LOs; received = tank discharges (BL volume).")}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi t={L("Commandé non enlevé (à date)", "Ordered not lifted")} v={`${fmt(m.last?.notLifted ?? 0)} L`} />
        <Kpi t={L("En transit (à date)", "In transit")} v={`${fmt(m.last?.transit ?? 0)} L`} />
        <Kpi t={L("Réceptionné en cuves (cumul)", "Received in tanks")} v={`${fmt(m.last?.received ?? 0)} L`} />
        <Kpi t={L("Exécution des commandes (période)", "Order execution")} v={`${m.exec.deliveredPct.toFixed(0)} %`} s={`${L("Enlevé", "Lifted")} ${m.exec.liftedPct.toFixed(0)} % · ${fmt(m.exec.ordered)} L ${L("commandés", "ordered")}`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi t={L("BE → chargement", "LO → loaded")} v={h(m.rot.beToLoad)} />
        <Kpi t={L("Chargement → départ", "Loaded → departed")} v={h(m.rot.loadToDepart)} />
        <Kpi t={L("Transit", "Transit")} v={h(m.rot.transit)} />
        <Kpi t={L("Livraison → dépotage", "Delivered → discharge")} v={h(m.rot.toDischarge)} />
        <Kpi t={L("Rotation totale moyenne", "Average rotation")} v={h(m.rot.total)} />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <LossTable title={L("Freinte par transporteur", "Loss by carrier")} rows={m.byCarrier} k="carriers" />
        <LossTable title={L("Freinte par camion", "Loss by truck")} rows={m.byTruck} k="vehicles" />
        <LossTable title={L("Freinte par chauffeur", "Loss by driver")} rows={m.byDriver} k="drivers" />
      </div>
      <Card className="glass-card"><CardHeader className="pb-2"><CardTitle className="text-base">{L("Fiche de mouvements de stock", "Stock movement sheet")}{product !== "all" && ` — ${prod(product)}`}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">{m.period.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">{L("Aucun mouvement sur la période.", "No movement in period.")}</p> : (
          <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>{L("Opération", "Operation")}</TableHead><TableHead>{L("Référence", "Reference")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead>
            <TableHead className="text-right">{L("Quantité", "Qty")}</TableHead><TableHead className="text-right">{L("Commandé non enlevé", "Not lifted")}</TableHead><TableHead className="text-right">{L("En transit", "Transit")}</TableHead><TableHead className="text-right">{L("Réceptionné", "Received")}</TableHead></TableRow></TableHeader>
            <TableBody>{m.period.map((s, i) => <TableRow key={i}><TableCell>{s.date.split("-").reverse().join("/")}</TableCell><TableCell>{kind[s.kind]}</TableCell><TableCell className="text-xs">{s.ref}</TableCell><TableCell>{prod(s.product_id)}</TableCell>
              <TableCell className="text-right">{fmt(s.qty)}</TableCell><TableCell className="text-right">{fmt(s.notLifted)}</TableCell><TableCell className="text-right">{fmt(s.transit)}</TableCell><TableCell className="text-right">{fmt(s.received)}</TableCell></TableRow>)}</TableBody></Table>)}
          {product === "all" && m.period.length > 0 && <p className="text-xs text-muted-foreground mt-2">{L("Astuce : choisissez un produit pour une fiche par produit.", "Tip: pick a product for a per-product sheet.")}</p>}
        </CardContent></Card>
    </div>
  );
};
