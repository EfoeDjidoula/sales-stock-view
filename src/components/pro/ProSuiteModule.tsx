import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { toast } from "sonner";
import { FileText, Download, WifiOff, Wifi, Thermometer, BookOpen, Truck, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  closureEntries, customerStatement, journalBalanced, offlineQueue, productFamily, splitThermalLoss, type JournalLine, type OfflineItem,
} from "@/lib/proSuite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const fmt = (n: number, d = 0) => (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: d });
const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";

async function exportXlsx(name: string, headers: string[], rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 30));
  ws.addRow(headers).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => (c.width = 18));
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf]));
  a.download = `${name}.xlsx`;
  a.click();
}

function exportPdf(title: string, subtitle: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14); doc.text(title, 14, 15);
  doc.setFontSize(9); doc.text(subtitle, 14, 21);
  const w = (doc.internal.pageSize.getWidth() - 28) / headers.length;
  let y = 30;
  const line = (cells: (string | number)[], bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    cells.forEach((c, i) => doc.text(String(c).slice(0, 28), 14 + i * w, y));
    y += 6;
    if (y > 195) { doc.addPage(); y = 15; }
  };
  line(headers, true);
  rows.forEach((r) => line(r));
  doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
}

function Period({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div><Label>Du</Label><Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} /></div>
      <div><Label>Au</Label><Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></div>
    </div>
  );
}

export default function ProSuiteModule() {
  const { tenantId, countryId, scopeQuery, scopeRow } = useScope();
  const brand = useBranding();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [d, setD] = useState<Record<string, Row[]>>({});

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const q = (t: string, cols: string) => scopeQuery(db.from(t).select(cols));
    const [stations, products, tanks, closures, payments, methods, pereq, trips, loads, supplies, clients, invoices, pays, moves] = await Promise.all([
      q("stations", "id,name"),
      q("petroleum_products", "id,code,name"),
      q("tanks", "id,name,station_id,product_id,product_type"),
      q("daily_closures", "id,station_id,closure_date,status,total_volume,total_amount").gte("closure_date", from).lte("closure_date", to).neq("status", "rejected"),
      q("closure_payments", "closure_id,payment_method_id,amount"),
      q("payment_methods", "id,name"),
      q("perequation_entries", "station_id,zone_id,product_type,quantity_liters,delivery_date,bl_number,rate_per_liter,total_amount,status").gte("delivery_date", from).lte("delivery_date", to),
      q("logistics_trips", "id,reference,status,carrier_id,truck_id,driver_id,qty_loaded,qty_delivered,planned_departure,delivered_at").order("created_at", { ascending: false }).limit(100),
      q("logistics_trip_loads", "trip_id,product_id,qty_litres,station_id,client_id,stop_order"),
      q("supply_requests", "id,reference,station_id,product_id,qty_loaded,qty_received,received_at,bl_number,status").not("qty_received", "is", null).order("received_at", { ascending: false }).limit(100),
      q("clients", "id,name"),
      q("b2b_invoices", "id,client_id,number,amount,period_end,due_on"),
      q("b2b_payments", "invoice_id,amount,reference,paid_on"),
      q("stock_movements", "station_id,product_id,movement_type,quantity,physical_level,movement_date,status").gte("movement_date", from).lte("movement_date", to + "T23:59:59"),
    ]);
    const err = [stations, closures, trips].find((r: Row) => r.error);
    if (err) toast.error(err.error.message);
    setD({
      stations: stations.data ?? [], products: products.data ?? [], tanks: tanks.data ?? [], closures: closures.data ?? [],
      payments: payments.data ?? [], methods: methods.data ?? [], pereq: pereq.data ?? [], trips: trips.data ?? [],
      loads: loads.data ?? [], supplies: supplies.data ?? [], clients: clients.data ?? [], invoices: invoices.data ?? [],
      pays: pays.data ?? [], moves: moves.data ?? [],
    });
    setLoading(false);
  }, [tenantId, countryId, from, to, scopeQuery]);

  useEffect(() => { load(); }, [load]);

  const stName = (id: string) => d.stations?.find((s) => s.id === id)?.name ?? "—";
  const prName = (id: string) => d.products?.find((p) => p.id === id)?.name ?? "—";
  const sub = `${brand?.companyName ?? ""} — période du ${from} au ${to}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold">Suite Pro</h2>
          <p className="text-sm text-muted-foreground">États officiels, comptabilité, e-CMR, coulage thermique, relevés B2B et saisie hors-ligne.</p>
        </div>
        <div className="flex items-end gap-2">
          <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
          {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>
      </div>

      <Tabs defaultValue="regl">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="regl"><FileText className="h-4 w-4 mr-1" />1. États réglementaires</TabsTrigger>
          <TabsTrigger value="compta"><BookOpen className="h-4 w-4 mr-1" />2. Passerelle comptable</TabsTrigger>
          <TabsTrigger value="ecmr"><Truck className="h-4 w-4 mr-1" />3. e-CMR & QR</TabsTrigger>
          <TabsTrigger value="thermo"><Thermometer className="h-4 w-4 mr-1" />4. Coulage thermique</TabsTrigger>
          <TabsTrigger value="b2b"><Users className="h-4 w-4 mr-1" />5. Relevés B2B</TabsTrigger>
          <TabsTrigger value="offline"><WifiOff className="h-4 w-4 mr-1" />6. Saisie hors-ligne</TabsTrigger>
        </TabsList>

        <TabsContent value="regl"><Regulatory d={d} stName={stName} prName={prName} sub={sub} /></TabsContent>
        <TabsContent value="compta"><Accounting d={d} stName={stName} sub={sub} /></TabsContent>
        <TabsContent value="ecmr"><Ecmr d={d} stName={stName} prName={prName} brandName={brand?.companyName ?? ""} /></TabsContent>
        <TabsContent value="thermo"><Thermal d={d} stName={stName} prName={prName} /></TabsContent>
        <TabsContent value="b2b"><Statements d={d} sub={sub} /></TabsContent>
        <TabsContent value="offline"><Offline d={d} stName={stName} prName={prName} scopeRow={scopeRow} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- 1. États réglementaires ---------- */
function Regulatory({ d, stName, prName, sub }: { d: Record<string, Row[]>; stName: (id: string) => string; prName: (id: string) => string; sub: string }) {
  const stockRows = useMemo(() => {
    const m = new Map<string, { st: string; pr: string; entry: number; out: number; last: number | null }>();
    for (const mv of d.moves ?? []) {
      if (mv.status !== "validated" || !mv.station_id) continue;
      const k = mv.station_id + mv.product_id;
      const r = m.get(k) ?? { st: stName(mv.station_id), pr: prName(mv.product_id), entry: 0, out: 0, last: null };
      if (["entry", "transfer_in", "adjustment_in", "initial"].includes(mv.movement_type)) r.entry += Number(mv.quantity);
      if (["exit", "sale", "transfer_out", "adjustment_out"].includes(mv.movement_type)) r.out += Number(mv.quantity);
      if (mv.movement_type === "inventory") r.last = Number(mv.physical_level);
      m.set(k, r);
    }
    return [...m.values()];
  }, [d.moves, stName, prName]);
  const pereq = d.pereq ?? [];
  const pereqTotal = pereq.reduce((s, p) => s + Number(p.total_amount || 0), 0);

  const H1 = ["Station", "Produit", "Entrées (L)", "Sorties (L)", "Dernier jaugeage (L)"];
  const R1 = stockRows.map((r) => [r.st, r.pr, fmt(r.entry), fmt(r.out), r.last == null ? "—" : fmt(r.last)]);
  const H2 = ["Date", "Station", "Produit", "BL", "Litres", "Taux", "Montant", "Statut"];
  const R2 = pereq.map((p) => [p.delivery_date, stName(p.station_id), p.product_type, p.bl_number ?? "", fmt(p.quantity_liters), fmt(p.rate_per_liter, 2), fmt(p.total_amount), p.status]);

  return (
    <div className="grid gap-4">
      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Déclaration des stocks (mouvements validés)</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exportPdf("Declaration_stocks", sub, H1, R1)}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button size="sm" variant="outline" onClick={() => exportXlsx("Declaration_stocks", H1, R1)}><Download className="h-4 w-4 mr-1" />Excel</Button>
          </div></CardHeader>
        <CardContent><SimpleTable headers={H1} rows={R1} empty="Aucun mouvement validé sur la période." /></CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader className="flex-row items-center justify-between"><CardTitle>État de péréquation transport — total {fmt(pereqTotal)} FCFA</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exportPdf("Etat_perequation", sub, H2, R2)}><Download className="h-4 w-4 mr-1" />PDF</Button>
            <Button size="sm" variant="outline" onClick={() => exportXlsx("Etat_perequation", H2, R2)}><Download className="h-4 w-4 mr-1" />Excel</Button>
          </div></CardHeader>
        <CardContent><SimpleTable headers={H2} rows={R2} empty="Aucune livraison soumise à péréquation." /></CardContent>
      </Card>
    </div>
  );
}

/* ---------- 2. Passerelle comptable ---------- */
function Accounting({ d, stName, sub }: { d: Record<string, Row[]>; stName: (id: string) => string; sub: string }) {
  const lines: JournalLine[] = useMemo(() => {
    const mName = (id: string) => d.methods?.find((m) => m.id === id)?.name ?? "Autre";
    return (d.closures ?? []).filter((c) => c.status === "validated").flatMap((c) =>
      closureEntries(
        { date: c.closure_date, ref: `CLO-${c.closure_date}-${String(c.id).slice(0, 4)}`, station: stName(c.station_id), amount: Number(c.total_amount) },
        (d.payments ?? []).filter((p) => p.closure_id === c.id).map((p) => ({ method: mName(p.payment_method_id), amount: Number(p.amount) })),
      ));
  }, [d, stName]);
  const H = ["Date", "Journal", "Compte", "Libellé", "Pièce", "Débit", "Crédit"];
  const R = lines.map((l) => [l.date, l.journal, l.account, l.label, l.ref, l.debit || "", l.credit || ""]);
  const td = lines.reduce((s, l) => s + l.debit, 0);
  const csv = () => {
    const txt = [H.join(";"), ...lines.map((l) => [l.date, l.journal, l.account, l.label, l.ref, l.debit, l.credit].join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv" }));
    a.download = "ecritures_ohada.csv"; a.click();
  };
  return (
    <Card className="glass-card">
      <CardHeader className="flex-row items-center justify-between">
        <div><CardTitle>Écritures SYSCOHADA des clôtures validées</CardTitle>
          <p className="text-sm text-muted-foreground">571 Caisse · 521 Banque · 585 Mobile Money · 411 Clients · 701 Ventes. Total {fmt(td)} FCFA — {journalBalanced(lines) ? "journal équilibré" : "déséquilibre"}.</p></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={csv}><Download className="h-4 w-4 mr-1" />CSV (Sage / Odoo)</Button>
          <Button size="sm" variant="outline" onClick={() => exportXlsx("Ecritures_OHADA", H, R)}><Download className="h-4 w-4 mr-1" />Excel</Button>
          <Button size="sm" variant="outline" onClick={() => exportPdf("Journal_ventes", sub, H, R)}><Download className="h-4 w-4 mr-1" />PDF</Button>
        </div>
      </CardHeader>
      <CardContent><SimpleTable headers={H} rows={R.map((r) => r.map((c) => (typeof c === "number" ? fmt(c) : c)))} empty="Aucune clôture validée sur la période." /></CardContent>
    </Card>
  );
}

/* ---------- 3. e-CMR ---------- */
function Ecmr({ d, stName, prName, brandName }: { d: Record<string, Row[]>; stName: (id: string) => string; prName: (id: string) => string; brandName: string }) {
  const cliName = (id: string) => d.clients?.find((c) => c.id === id)?.name ?? "—";
  const make = async (t: Row) => {
    const loads = (d.loads ?? []).filter((l) => l.trip_id === t.id).sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));
    const payload = JSON.stringify({ ref: t.reference, id: t.id, qty: t.qty_loaded, status: t.status });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 220 });
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Lettre de voiture électronique (e-CMR)", 14, 18);
    doc.setFontSize(10);
    doc.text(`Émetteur : ${brandName}`, 14, 28);
    doc.text(`Transport : ${t.reference}   Statut : ${t.status}`, 14, 34);
    doc.text(`Départ prévu : ${t.planned_departure ? new Date(t.planned_departure).toLocaleString("fr-FR") : "—"}`, 14, 40);
    doc.text(`Quantité chargée : ${fmt(t.qty_loaded)} L   Livrée : ${fmt(t.qty_delivered)} L`, 14, 46);
    doc.addImage(qr, "PNG", 150, 10, 45, 45);
    let y = 62;
    doc.setFont("helvetica", "bold"); doc.text("Arrêt   Destination                    Produit           Litres", 14, y); y += 6;
    doc.setFont("helvetica", "normal");
    loads.forEach((l) => { doc.text(`${l.stop_order ?? "-"}       ${(l.station_id ? stName(l.station_id) : cliName(l.client_id)).slice(0, 28).padEnd(30)} ${prName(l.product_id).slice(0, 16).padEnd(18)} ${fmt(l.qty_litres)}`, 14, y); y += 6; });
    y += 12;
    ["Expéditeur (dépôt)", "Transporteur / chauffeur", "Destinataire"].forEach((s, i) => { doc.rect(14 + i * 62, y, 58, 30); doc.text(s, 16 + i * 62, y + 5); });
    doc.setFontSize(8); doc.text("Le QR code permet de vérifier la référence et les quantités du transport.", 14, y + 40);
    doc.save(`eCMR_${t.reference}.pdf`);
  };
  return (
    <Card className="glass-card"><CardHeader><CardTitle>Lettres de voiture des transports</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Statut</TableHead><TableHead>Chargé (L)</TableHead><TableHead>Destinations</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(d.trips ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Aucun transport.</TableCell></TableRow>}
            {(d.trips ?? []).map((t) => (
              <TableRow key={t.id}><TableCell className="font-mono">{t.reference}</TableCell><TableCell><Badge variant="outline">{t.status}</Badge></TableCell>
                <TableCell>{fmt(t.qty_loaded)}</TableCell><TableCell>{(d.loads ?? []).filter((l) => l.trip_id === t.id).length}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => make(t)}><Download className="h-4 w-4 mr-1" />e-CMR</Button></TableCell></TableRow>
            ))}
          </TableBody></Table>
      </CardContent></Card>
  );
}

/* ---------- 4. Coulage thermique ---------- */
function Thermal({ d, stName, prName }: { d: Record<string, Row[]>; stName: (id: string) => string; prName: (id: string) => string }) {
  const [temps, setTemps] = useState<Record<string, { load: string; recv: string }>>({});
  return (
    <Card className="glass-card"><CardHeader><CardTitle>Écart réel vs dilatation (volumes ramenés à 15 °C)</CardTitle>
      <p className="text-sm text-muted-foreground">Saisissez la température au chargement et à la réception. Coefficients : Super 0,00120 /°C, Gasoil 0,00083 /°C.</p></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>Réception</TableHead><TableHead>Station / produit</TableHead><TableHead>Chargé</TableHead><TableHead>Reçu</TableHead><TableHead>T° charg.</TableHead><TableHead>T° récep.</TableHead><TableHead>Part thermique</TableHead><TableHead>Perte réelle</TableHead></TableRow></TableHeader>
          <TableBody>
            {(d.supplies ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Aucune réception enregistrée.</TableCell></TableRow>}
            {(d.supplies ?? []).map((s) => {
              const t = temps[s.id] ?? { load: "", recv: "" };
              const ok = t.load !== "" && t.recv !== "" && s.qty_loaded;
              const r = ok ? splitThermalLoss(Number(s.qty_loaded), Number(t.load), Number(s.qty_received), Number(t.recv), productFamily(prName(s.product_id))) : null;
              const set = (k: "load" | "recv", v: string) => setTemps((p) => ({ ...p, [s.id]: { ...t, [k]: v } }));
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.reference}</TableCell>
                  <TableCell>{stName(s.station_id)} · {prName(s.product_id)}</TableCell>
                  <TableCell>{fmt(s.qty_loaded)}</TableCell><TableCell>{fmt(s.qty_received)}</TableCell>
                  <TableCell><Input className="w-20" type="number" value={t.load} onChange={(e) => set("load", e.target.value)} /></TableCell>
                  <TableCell><Input className="w-20" type="number" value={t.recv} onChange={(e) => set("recv", e.target.value)} /></TableCell>
                  <TableCell>{r ? `${fmt(r.thermalPart, 1)} L` : "—"}</TableCell>
                  <TableCell>{r ? <Badge variant={r.realLossPct > 0.5 ? "destructive" : "outline"}>{fmt(r.realLoss, 1)} L ({fmt(r.realLossPct, 2)} %)</Badge> : "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>
      </CardContent></Card>
  );
}

/* ---------- 5. Relevés B2B ---------- */
function Statements({ d, sub }: { d: Record<string, Row[]>; sub: string }) {
  const withInv = (d.clients ?? []).filter((c) => (d.invoices ?? []).some((i) => i.client_id === c.id));
  const [client, setClient] = useState("");
  const rows = useMemo(() => {
    const inv = (d.invoices ?? []).filter((i) => i.client_id === client);
    const pays = (d.pays ?? []).filter((p) => inv.some((i) => i.id === p.invoice_id));
    return customerStatement(
      inv.map((i) => ({ date: i.period_end, ref: i.number, amount: Number(i.amount) })),
      pays.map((p) => ({ date: p.paid_on, ref: p.reference ?? "", amount: Number(p.amount) })),
    );
  }, [d, client]);
  const H = ["Date", "Type", "Pièce", "Débit", "Crédit", "Solde"];
  const R = rows.map((r) => [r.date, r.kind, r.ref, fmt(r.debit), fmt(r.credit), fmt(r.balance)]);
  const name = withInv.find((c) => c.id === client)?.name ?? "";
  return (
    <Card className="glass-card"><CardHeader className="flex-row items-center justify-between gap-3 flex-wrap"><CardTitle>Relevé de compte client</CardTitle>
      <div className="flex gap-2">
        <Select value={client} onValueChange={setClient}><SelectTrigger className="w-64"><SelectValue placeholder="Choisir un client B2B" /></SelectTrigger>
          <SelectContent>{withInv.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" variant="outline" disabled={!client} onClick={() => exportPdf(`Releve_${name}`, sub, H, R)}><Download className="h-4 w-4 mr-1" />PDF</Button>
        <Button size="sm" variant="outline" disabled={!client} onClick={() => exportXlsx(`Releve_${name}`, H, R)}><Download className="h-4 w-4 mr-1" />Excel</Button>
      </div></CardHeader>
      <CardContent><SimpleTable headers={H} rows={R} empty={client ? "Aucune opération." : "Sélectionnez un client."} /></CardContent></Card>
  );
}

/* ---------- 6. Saisie hors-ligne ---------- */
function Offline({ d, stName, prName, scopeRow }: { d: Record<string, Row[]>; stName: (id: string) => string; prName: (id: string) => string; scopeRow: <T extends Record<string, unknown>>(r: T) => T }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<OfflineItem[]>(offlineQueue.list());
  const [tank, setTank] = useState("");
  const [level, setLevel] = useState("");
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    const items = offlineQueue.list();
    if (!items.length || !navigator.onLine) return;
    setSyncing(true);
    const left: OfflineItem[] = [];
    for (const it of items) {
      const { error } = await db.from(it.table).insert(it.row);
      if (error) left.push({ ...it, error: error.message });
    }
    offlineQueue.save(left); setQueue(left); setSyncing(false);
    toast.success(`${items.length - left.length} saisie(s) synchronisée(s)${left.length ? `, ${left.length} en erreur` : ""}`);
  }, []);

  useEffect(() => {
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [sync]);

  const add = () => {
    const tk = d.tanks?.find((x) => x.id === tank);
    const n = Number(level);
    if (!tk || !tk.product_id) return toast.error("Choisissez une cuve reliée à un produit");
    if (level === "" || !(n >= 0)) return toast.error("Niveau invalide (nombre positif)");
    offlineQueue.add("stock_movements", scopeRow({
      location_type: "station", station_id: tk.station_id, tank_id: tk.id, product_id: tk.product_id,
      movement_type: "inventory", quantity: 0, physical_level: n,
      reason: "Jaugeage terrain (saisie hors-ligne)", movement_date: new Date().toISOString(),
    }));
    setQueue(offlineQueue.list()); setLevel("");
    toast.success("Jaugeage gardé sur cet appareil");
    if (navigator.onLine) sync();
  };

  return (
    <Card className="glass-card"><CardHeader className="flex-row items-center justify-between"><CardTitle>Jaugeages terrain</CardTitle>
      <Badge variant={online ? "outline" : "destructive"}>{online ? <><Wifi className="h-3 w-3 mr-1" />En ligne</> : <><WifiOff className="h-3 w-3 mr-1" />Hors ligne</>}</Badge></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Les jaugeages sont conservés sur l'appareil sans réseau, puis envoyés automatiquement au retour de la connexion. Ils suivent la validation habituelle des mouvements de stock.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div><Label>Cuve</Label>
            <Select value={tank} onValueChange={setTank}><SelectTrigger className="w-72"><SelectValue placeholder="Choisir une cuve" /></SelectTrigger>
              <SelectContent>{(d.tanks ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{stName(t.station_id)} — {t.name} ({prName(t.product_id)})</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Niveau mesuré (L)</Label><Input type="number" min={0} value={level} onChange={(e) => setLevel(e.target.value)} className="w-40" /></div>
          <Button onClick={add}>Enregistrer</Button>
          <Button variant="outline" disabled={!queue.length || !online || syncing} onClick={sync}>{syncing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Synchroniser ({queue.length})</Button>
        </div>
        <SimpleTable headers={["Saisi le", "Cuve", "Niveau", "État"]} empty="Aucune saisie en attente."
          rows={queue.map((q) => [new Date(q.createdAt).toLocaleString("fr-FR"), d.tanks?.find((t) => t.id === q.row.tank_id)?.name ?? "—", fmt(Number(q.row.physical_level)), q.error ? `Erreur : ${q.error}` : "En attente"])} />
      </CardContent></Card>
  );
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <Table><TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={headers.length} className="text-muted-foreground">{empty}</TableCell></TableRow>}
        {rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
      </TableBody></Table>
  );
}
