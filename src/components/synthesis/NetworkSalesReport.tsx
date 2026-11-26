import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays } from "@/lib/reports";
import { weekOf } from "@/lib/ecap";
import { NETWORK_HEADERS, networkCells, networkRow, networkTotal } from "@/lib/networkSales";
import { exportNetworkPdf, exportNetworkXlsx } from "@/lib/ecapExport";
import { useScopedStations, useSynthesisPeriod } from "./useSynthesisPeriod";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v: string | number) => (typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : v || "—");

export default function NetworkSalesReport() {
  const brand = useBranding();
  const [from, setFrom] = useState(() => addDays(today(), -1));
  const [to, setTo] = useState(() => addDays(today(), -1));
  const [inc, setInc] = useState(true);
  const valid = from && to && from <= to && to <= today();
  const { data: stations = [] } = useScopedStations();
  const { data, isLoading, error } = useSynthesisPeriod(from, to, inc);

  const rows = useMemo(() => stations.map((s) => networkRow(s.name, (data?.entries ?? []).filter((e) => e.station_id === s.id), from, to)), [stations, data, from, to]);
  const total = useMemo(() => networkTotal(rows), [rows]);
  const shift = (n: number) => { setFrom(addDays(from, n)); setTo(addDays(to, n)); };
  const day = (d: string) => { setFrom(d); setTo(d); };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <CardTitle>Bilan des ventes et encaissements réseau</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>Date de début</Label><Input type="date" value={from} max={today()} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>Date de fin</Label><Input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" size="icon" aria-label="Jour précédent" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Jour suivant" disabled={to >= addDays(today(), -1)} onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="secondary" onClick={() => day(addDays(today(), -1))}>Veille (N-1)</Button>
          <Button variant="secondary" onClick={() => { const w = weekOf(addDays(today(), -1)); setFrom(w.from); setTo(addDays(today(), -1) < w.to ? addDays(today(), -1) : w.to); }}>Semaine en cours</Button>
          <div className="flex items-center gap-2"><Switch id="inc" checked={inc} onCheckedChange={setInc} /><Label htmlFor="inc">Inclure les index non validés</Label></div>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" className="gap-2" disabled={!data || !valid} onClick={() => void exportNetworkXlsx(rows, total, from, to, inc, brand.legalName)}><Download className="w-4 h-4" />Excel</Button>
            <Button variant="outline" className="gap-2" disabled={!data || !valid} onClick={() => exportNetworkPdf(rows, total, from, to, inc)}><FileText className="w-4 h-4" />PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!valid ? <p className="text-sm text-muted-foreground">Choisissez une période valide (pas de date future).</p>
          : error ? <p className="text-sm text-destructive">{(error as Error).message}</p>
          : isLoading ? <Skeleton className="h-64 w-full" />
          : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{NETWORK_HEADERS.map((h, i) => <TableHead key={h} className={i > 0 && i < 11 ? "text-right whitespace-nowrap" : "whitespace-nowrap"}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {[...rows, total].map((x, ri) => (
                    <TableRow key={x.station + ri} className={ri === rows.length ? "font-bold bg-muted/50" : ""}>
                      {networkCells(x).map((v, i) => (
                        <TableCell key={i} className={i > 0 && i < 11 ? "text-right tabular-nums whitespace-nowrap" : "whitespace-nowrap"}>
                          {fmt(v)}
                          {i === 0 && ri < rows.length && (x.jours === 0 ? <Badge variant="outline" className="ml-2">Sans saisie</Badge> : x.pending > 0 ? <Badge variant="secondary" className="ml-2">Provisoire</Badge> : null)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">Vente réelle = vente totale − bons − tickets − cartes · Liquidité = vente réelle − MoMo Pay · Écart = montant versé − liquidité.</p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
