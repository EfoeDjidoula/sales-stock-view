import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { summarize, fuelOf, type ProvisionLine } from "@/lib/stationProvision";
import { useCountryPrices } from "@/hooks/useCountryPrices";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const ALL = "__all";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const StationProvisionTab = ({ d, L }: { d: Record<string, Row[]>; L: (fr: string, en: string) => string }) => {
  const { priceOf } = useCountryPrices();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [station, setStation] = useState(ALL);

  const name = (list: string, id: string) => (d[list] ?? []).find((x) => x.id === id)?.name ?? "—";
  const lines: ProvisionLine[] = useMemo(() => (d.liftings ?? []).filter((b) => b.status === "signed").flatMap((b) => {
    const trip = (d.trips ?? []).find((t) => t.id === b.trip_id);
    const date = String(trip?.delivered_at ?? trip?.loaded_at ?? "").slice(0, 10);
    if (!trip || !trip.loaded_at || date < from || date > to) return [];
    return (d.loads ?? []).filter((l) => l.trip_id === b.trip_id && l.station_id && (station === ALL || l.station_id === station)).map((l) => {
      const fuel = fuelOf((d.products ?? []).find((x) => x.id === l.product_id));
      const unit = fuel ? priceOf(date, fuel) : 0;
      return { stationId: l.station_id, productId: l.product_id, date, litres: Number(l.qty_litres), unitPrice: unit, amount: unit * Number(l.qty_litres), tripRef: trip.reference };
    });
  }), [d, priceOf, from, to, station]);
  const sum = summarize(lines);
  const total = lines.reduce((s, l) => s + l.amount, 0);

  const exportXlsx = async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Mise à disposition");
    ws.addRow([`Mise à disposition des stations du ${from} au ${to}`]); ws.addRow([]);
    ws.addRow(["Date", "Transport", "Station", "Produit", "Litres (BL)", "Prix pompe", "Valeur"]);
    lines.forEach((l) => ws.addRow([l.date, l.tripRef, name("stations", l.stationId), name("products", l.productId), l.litres, Math.round(l.unitPrice * 100) / 100, Math.round(l.amount)]));
    ws.addRow([]); ws.addRow(["", "", "", "Total", lines.reduce((s, l) => s + l.litres, 0), "", Math.round(total)]);
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mise-a-disposition_${from}_${to}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card"><CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1"><Label className="text-xs">{L("Du", "From")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">{L("Au", "To")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">{L("Station", "Station")}</Label>
          <Select value={station} onValueChange={setStation}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>{L("Toutes", "All")}</SelectItem>{(d.stations ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" onClick={exportXlsx} disabled={!lines.length}><Download className="h-4 w-4 mr-1" />Excel</Button>
      </CardContent></Card>
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">{L("Mise à disposition & valorisation par station", "Station provision & valuation")}</CardTitle>
          <p className="text-xs text-muted-foreground">{L("Volume BL chargé × prix pompe du pays en vigueur à la date de livraison (structure de prix). Lecture seule, aucun stock modifié.", "Loaded DN volume × country pump price in force on delivery date. Read-only.")}</p></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{L("Station", "Station")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead><TableHead className="text-right">{L("Livraisons", "Deliveries")}</TableHead><TableHead className="text-right">{L("Litres (BL)", "Litres (DN)")}</TableHead><TableHead className="text-right">{L("Valeur au prix pompe", "Value at pump price")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {sum.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{L("Aucune mise à disposition sur la période.", "No provision in this period.")}</TableCell></TableRow>}
              {sum.map((s) => <TableRow key={s.stationId + s.productId}><TableCell>{name("stations", s.stationId)}</TableCell><TableCell>{name("products", s.productId)}</TableCell><TableCell className="text-right">{s.count}</TableCell><TableCell className="text-right">{fmt(s.litres)}</TableCell><TableCell className="text-right">{fmt(s.amount)}</TableCell></TableRow>)}
              {sum.length > 0 && <TableRow className="font-semibold"><TableCell colSpan={3}>Total</TableCell><TableCell className="text-right">{fmt(sum.reduce((a, s) => a + s.litres, 0))}</TableCell><TableCell className="text-right">{fmt(total)}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
