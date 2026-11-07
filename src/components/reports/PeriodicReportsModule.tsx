import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import jsPDF from "@/lib/pdf";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, agedBalance, dailyFlash, kindOf, logisticsSummary, pctChange, salesByDay, salesByStation } from "@/lib/reports";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const today = new Date().toISOString().slice(0, 10);
const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : (Number(v) || 0).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${fmt(v, 1)} %`);

type Report = { title: string; headers: string[]; rows: (string | number)[][]; note?: string };

const REPORTS = {
  flash: "Flash ventes quotidien",
  monthly: "Bilan mensuel du réseau",
  stock: "Bilan stocks & alertes rupture",
  losses: "Écarts & coulages",
  control: "Contrôle hebdomadaire (réconciliation & fraude)",
  aged: "Balance âgée des créances B2B",
  logistics: "Exécution logistique",
} as const;
type Key = keyof typeof REPORTS;

/** Période par défaut adaptée à chaque rapport. */
function defaultPeriod(k: Key, ref: string) {
  if (k === "flash" || k === "stock" || k === "aged") return { from: ref, to: ref };
  if (k === "control") return { from: addDays(ref, -6), to: ref };
  return { from: ref.slice(0, 8) + "01", to: ref };
}

async function toXlsx(r: Report, sub: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(r.title.slice(0, 30));
  ws.addRow([r.title]).font = { bold: true, size: 14 };
  ws.addRow([sub]);
  ws.addRow([]);
  ws.addRow(r.headers).font = { bold: true };
  r.rows.forEach((x) => ws.addRow(x));
  ws.columns.forEach((c) => (c.width = 20));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
  a.download = `${r.title.replace(/\s+/g, "_")}.xlsx`;
  a.click();
}

function toPdf(r: Report, sub: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14); doc.text(r.title, 14, 15);
  doc.setFontSize(9); doc.text(sub, 14, 21);
  if (r.note) doc.text(r.note, 14, 26);
  const w = (doc.internal.pageSize.getWidth() - 28) / r.headers.length;
  let y = 34;
  const line = (cells: (string | number)[], bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    cells.forEach((c, i) => doc.text(String(c).slice(0, 30), 14 + i * w, y));
    y += 6;
    if (y > 195) { doc.addPage(); y = 15; }
  };
  line(r.headers, true);
  r.rows.forEach((x) => line(x));
  doc.setFontSize(7); doc.text(`Édité le ${new Date().toLocaleString("fr-FR")}`, 14, 205);
  doc.save(`${r.title.replace(/\s+/g, "_")}.pdf`);
}

export default function PeriodicReportsModule() {
  const { tenantId, countryId, scopeQuery } = useScope();
  const brand = useBranding();
  const [key, setKey] = useState<Key>("flash");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [d, setD] = useState<Record<string, Row[]>>({});

  const pick = (k: Key) => { setKey(k); const p = defaultPeriod(k, today); setFrom(p.from); setTo(p.to); };

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const q = (t: string, cols: string) => scopeQuery(db.from(t).select(cols));
    // Comparaisons : J-7 pour le flash, mois précédent pour le bilan mensuel.
    const start = addDays(from, -40);
    const res = await Promise.all([
      q("stations", "id,name"),
      q("petroleum_products", "id,code,name"),
      q("daily_closures", "id,station_id,closure_date,status").gte("closure_date", start).lte("closure_date", to),
      q("closure_sales", "closure_id,product_id,volume,amount"),
      q("stock_levels", "station_id,tank_id,product_id,theoretical,physical,variance,capacity,alert_level"),
      q("reconciliations", "station_id,recon_date,result,volume_variance,value_variance").gte("recon_date", from).lte("recon_date", to),
      q("fraud_alerts", "station_id,alert_date,severity,workflow,title").gte("alert_date", from).lte("alert_date", to),
      q("clients", "id,name"),
      q("b2b_invoices", "id,client_id,amount,due_on"),
      q("b2b_payments", "invoice_id,amount"),
      q("logistics_trips", "status,qty_loaded,qty_delivered,departed_at,delivered_at,planned_departure,created_at").gte("created_at", from).lte("created_at", to + "T23:59:59"),
    ]);
    const names = ["stations", "products", "closures", "sales", "levels", "recons", "fraud", "clients", "invoices", "payments", "trips"];
    const err = res.find((r: Row) => r.error);
    if (err) toast.error(`Données incomplètes : ${err.error.message}`);
    setD(Object.fromEntries(names.map((nm, i) => [nm, res[i].data ?? []])));
    setLoading(false);
  }, [tenantId, countryId, from, to, scopeQuery]);

  useEffect(() => { load(); }, [load]);

  const report = useMemo<Report | null>(() => {
    if (!d.stations) return null;
    const st = (id: string | null) => d.stations.find((s) => s.id === id)?.name ?? "—";
    const pk = (id: string | null) => kindOf(d.products.find((p) => p.id === id));
    const pName = (id: string | null) => d.products.find((p) => p.id === id)?.name ?? "—";
    switch (key) {
      case "flash": {
        const f = dailyFlash(salesByDay(d.closures as never, d.sales as never, pk), to);
        const row = (l: string, x: typeof f.cur) => [l, fmt(x.super), fmt(x.gasoil), fmt(x.amount)];
        return {
          title: REPORTS.flash, headers: ["Jour", "Super (L)", "Gasoil (L)", "CA (FCFA)"],
          rows: [row(`Jour ${to}`, f.cur), row("J-1", f.d1), row("J-7", f.d7), ["Variation CA", "", "", `${pct(f.vsD1)} vs J-1 / ${pct(f.vsD7)} vs J-7`]],
          note: "Clôtures non rejetées uniquement.",
        };
      }
      case "monthly": {
        const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
        const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -len);
        const cur = salesByStation(d.closures as never, d.sales as never, from, to);
        const prev = salesByStation(d.closures as never, d.sales as never, prevFrom, prevTo);
        const rows = d.stations.map((s) => {
          const c = cur.get(s.id) ?? { volume: 0, amount: 0 }, p = prev.get(s.id) ?? { volume: 0, amount: 0 };
          return { name: s.name, c, p };
        }).sort((a, b) => b.c.amount - a.c.amount);
        const tot = rows.reduce((t, r) => ({ v: t.v + r.c.volume, a: t.a + r.c.amount, pa: t.pa + r.p.amount }), { v: 0, a: 0, pa: 0 });
        return {
          title: REPORTS.monthly, headers: ["Station", "Volume (L)", "CA (FCFA)", "CA période préc.", "Variation"],
          rows: [...rows.map((r) => [r.name, fmt(r.c.volume), fmt(r.c.amount), fmt(r.p.amount), pct(pctChange(r.c.amount, r.p.amount))]),
            ["TOTAL", fmt(tot.v), fmt(tot.a), fmt(tot.pa), pct(pctChange(tot.a, tot.pa))]],
          note: `Comparé à la période précédente de même durée (${prevFrom} → ${prevTo}).`,
        };
      }
      case "stock": {
        const lv = d.levels.filter((l) => l.tank_id).sort((a, b) => (a.alert_level === "ok" ? 1 : 0) - (b.alert_level === "ok" ? 1 : 0));
        return {
          title: REPORTS.stock, headers: ["Station", "Produit", "Stock théorique (L)", "Capacité (L)", "Remplissage", "Alerte"],
          rows: lv.map((l) => [st(l.station_id), pName(l.product_id), fmt(l.theoretical), fmt(l.capacity), l.capacity ? `${fmt((l.theoretical / l.capacity) * 100, 1)} %` : "—", l.alert_level ?? "—"]),
          note: "Situation actuelle du registre de stock.",
        };
      }
      case "losses": {
        const lv = d.levels.filter((l) => l.physical != null);
        return {
          title: REPORTS.losses, headers: ["Station", "Produit", "Théorique (L)", "Physique (L)", "Écart (L)", "Écart %"],
          rows: lv.map((l) => [st(l.station_id), pName(l.product_id), fmt(l.theoretical), fmt(l.physical), fmt(l.variance), l.theoretical ? `${fmt((l.variance / l.theoretical) * 100, 2)} %` : "—"]),
          note: "Dernier jaugeage comparé au stock théorique. Tolérance de référence ±0,5 %.",
        };
      }
      case "control": {
        const by = new Map<string, { recon: number; anomalies: number; value: number; fraud: number; critical: number }>();
        const g = (id: string) => by.get(id) ?? { recon: 0, anomalies: 0, value: 0, fraud: 0, critical: 0 };
        d.recons.forEach((r) => { const x = g(r.station_id); x.recon++; if (r.result !== "conforme" && r.result !== "compliant") x.anomalies++; x.value += Number(r.value_variance) || 0; by.set(r.station_id, x); });
        d.fraud.forEach((f) => { const id = f.station_id ?? "—"; const x = g(id); x.fraud++; if (f.severity === "critical") x.critical++; by.set(id, x); });
        return {
          title: REPORTS.control, headers: ["Station", "Réconciliations", "Non conformes", "Écart valeur (FCFA)", "Alertes fraude", "Dont critiques"],
          rows: [...by.entries()].map(([id, x]) => [st(id), x.recon, x.anomalies, fmt(x.value), x.fraud, x.critical]),
        };
      }
      case "aged": {
        const b = agedBalance(d.invoices as never, d.payments as never, to);
        const cl = (id: string) => d.clients.find((c) => c.id === id)?.name ?? "—";
        const rows = [...b.entries()].sort((a, c) => c[1].total - a[1].total);
        return {
          title: REPORTS.aged, headers: ["Client", "Non échu", "1-30 j", "31-60 j", "> 60 j", "Total dû"],
          rows: rows.map(([id, x]) => [cl(id), fmt(x.notDue), fmt(x.d0_30), fmt(x.d31_60), fmt(x.d60p), fmt(x.total)]),
          note: `Retards calculés au ${to}. Montants en FCFA.`,
        };
      }
      case "logistics": {
        const s = logisticsSummary(d.trips as never);
        return {
          title: REPORTS.logistics, headers: ["Indicateur", "Valeur"],
          rows: [["Transports créés", s.total], ["Livrés", s.delivered], ["Incidents", s.incidents], ["Taux de livraison", s.rate == null ? "—" : `${fmt(s.rate, 1)} %`],
            ["Durée moyenne départ → livraison", s.avgHours == null ? "—" : `${fmt(s.avgHours, 1)} h`], ["Écart livré − chargé (L)", fmt(s.gap)], ["Écart %", s.gapPct == null ? "—" : `${fmt(s.gapPct, 2)} %`]],
        };
      }
    }
  }, [d, key, from, to]);

  const sub = `${brand?.companyName ?? ""} — période du ${from} au ${to}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-display font-bold">Rapports périodiques</h2>
        <p className="text-sm text-muted-foreground">Rapports de direction, stocks, contrôle, crédit B2B et logistique, exportables en PDF et Excel.</p>
      </div>
      <Card className="glass-card">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="min-w-[280px]">
            <Label>Rapport</Label>
            <Select value={key} onValueChange={(v) => pick(v as Key)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(REPORTS) as Key[]).map((k) => <SelectItem key={k} value={k}>{REPORTS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Du</Label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Au</Label><Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" disabled={!report || loading} onClick={() => report && toPdf(report, sub)}><FileText className="h-4 w-4 mr-1" />PDF</Button>
          <Button variant="outline" disabled={!report || loading} onClick={() => report && toXlsx(report, sub)}><Download className="h-4 w-4 mr-1" />Excel</Button>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardHeader><CardTitle>{REPORTS[key]}</CardTitle>{report?.note && <p className="text-xs text-muted-foreground">{report.note}</p>}</CardHeader>
        <CardContent>
          {loading || !report ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow>{report.headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {report.rows.length === 0 ? <TableRow><TableCell colSpan={report.headers.length} className="text-center text-muted-foreground">Aucune donnée sur cette période.</TableCell></TableRow>
                  : report.rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
