import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarRange, Download, FileText, Loader2 } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays } from "@/lib/reports";
import { missingDays } from "@/lib/managerAccount";
import { dailyLines, monthOf, pumpRecap, salesLine, voucherRecap, weekOf, weeklyLines } from "@/lib/ecap";
import { dateFr } from "@/lib/accountClosingExport";
import { SALES_HEADERS, exportEcapPdf, exportEcapXlsx, salesCells, type EcapSheet } from "@/lib/ecapExport";
import { forStation, useScopedStations, useSynthesisPeriod } from "./useSynthesisPeriod";
import { useLastGerant } from "./useLastGerant";
import { PumpTable } from "./PumpTable";

const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
const fmt = (v: number, d = 0) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Récaps ECAP hebdomadaire (lundi–dimanche) et mensuel, par station, sur le modèle papier. */
export default function EcapRecap() {
  const brand = useBranding();
  const [kind, setKind] = useState<"hebdo" | "mensuel">("hebdo");
  const [stationId, setStationId] = useState("");
  const [weekDate, setWeekDate] = useState(yesterday);
  const [month, setMonth] = useState(yesterday.slice(0, 7));
  const [includePending, setIncludePending] = useState(false);
  const [gerant, setGerant] = useState("");

  const { data: stations = [] } = useScopedStations();
  useEffect(() => { if (!stationId && stations.length) setStationId(stations[0].id); }, [stations, stationId]);
  const station = stations.find((s) => s.id === stationId);
  const { data: lastGerant } = useLastGerant(stationId);
  useEffect(() => { setGerant(lastGerant ?? ""); }, [stationId, lastGerant]);

  const range = kind === "hebdo" ? weekOf(weekDate || yesterday) : monthOf(month || yesterday.slice(0, 7));
  const from = range.from;
  const to = range.to > yesterday ? yesterday : range.to;
  const { data, isLoading, isFetching, error } = useSynthesisPeriod(from, to, includePending);

  const build = useCallback((id: string, name: string, ger: string): EcapSheet | null => {
    if (!data) return null;
    const d = forStation(data, id);
    const total = salesLine("TOTAL", from, to, d.entries);
    return {
      kind, stationName: name, gerant: ger, from, to, includePending,
      pumps: pumpRecap(d.pumps, data.pumpNames, data.price),
      rows: kind === "hebdo" ? dailyLines(d.entries, from, to) : weeklyLines(d.entries, from, to),
      total, vouchers: voucherRecap(total), missing: missingDays(from, to, d.entries),
    };
  }, [data, kind, from, to, includePending]);

  const sheet = useMemo(() => (station ? build(station.id, station.name, gerant.trim()) : null), [build, station, gerant]);
  const allSheets = () => stations.map((s) => build(s.id, s.name, s.id === stationId ? gerant.trim() : "")).filter((s): s is EcapSheet => !!s && (s.total.jours > 0 || s.pumps.lines.length > 0));

  return (
    <div className="space-y-5">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={kind === "hebdo" ? "default" : "outline"} className="gap-2" onClick={() => setKind("hebdo")}><CalendarDays className="w-4 h-4" />Hebdomadaire</Button>
            <Button size="sm" variant={kind === "mensuel" ? "default" : "outline"} className="gap-2" onClick={() => setKind("mensuel")}><CalendarRange className="w-4 h-4" />Mensuel</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-1.5">
              <Label>Station</Label>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger><SelectValue placeholder="Choisir une station" /></SelectTrigger>
                <SelectContent>{stations.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {kind === "hebdo" ? (
              <div className="space-y-1.5"><Label htmlFor="ecap-week">Un jour de la semaine</Label><Input id="ecap-week" type="date" value={weekDate} max={yesterday} onChange={(e) => setWeekDate(e.target.value)} /></div>
            ) : (
              <div className="space-y-1.5"><Label htmlFor="ecap-month">Mois</Label><Input id="ecap-month" type="month" value={month} max={yesterday.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></div>
            )}
            <div className="space-y-1.5"><Label htmlFor="ecap-ger">Gérant</Label><Input id="ecap-ger" value={gerant} onChange={(e) => setGerant(e.target.value)} placeholder="Nom et prénoms" /></div>
            <div className="text-sm text-muted-foreground pb-2">Période : du {dateFr(from)} au {dateFr(to)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={includePending} onCheckedChange={setIncludePending} />Inclure les saisies en attente de validation N+1</label>
            <span>Montants des pistolets au prix du jour (structure de prix en vigueur).</span>
            {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={!sheet} onClick={() => void exportEcapXlsx([sheet!], brand.legalName)}><Download className="w-4 h-4" />Excel station</Button>
            <Button variant="outline" className="gap-2" disabled={!sheet} onClick={() => exportEcapPdf([sheet!])}><FileText className="w-4 h-4" />PDF station</Button>
            <Button variant="outline" className="gap-2" disabled={!data} onClick={() => void exportEcapXlsx(allSheets(), brand.legalName)}><Download className="w-4 h-4" />Excel toutes stations</Button>
            <Button variant="outline" className="gap-2" disabled={!data} onClick={() => exportEcapPdf(allSheets())}><FileText className="w-4 h-4" />PDF toutes stations</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-negative">Données indisponibles : {(error as Error).message}</p>}
      {isLoading && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}

      {sheet && (
        <>
          {sheet.missing.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
              <span>{sheet.missing.length} jour(s) sans saisie {includePending ? "retenue" : "validée N+1"}{sheet.missing.length <= 8 ? ` : ${sheet.missing.map(dateFr).join(", ")}` : ""}.</span>
            </div>
          )}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Index et sorties par pistolet</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><PumpTable recap={sheet.pumps} /></CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">{kind === "hebdo" ? "Détail des ventes journalières" : "Détail des ventes hebdomadaires"} (FCFA)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[980px]">
                <TableHeader><TableRow><TableHead>{kind === "hebdo" ? "Dates" : "Périodes"}</TableHead>{SALES_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {[...sheet.rows, sheet.total].map((l) => (
                    <TableRow key={l.label} className={l.label === "TOTAL" ? "bg-muted/30 font-semibold" : l.jours ? "" : "text-muted-foreground"}>
                      <TableCell className="whitespace-nowrap">{l.label}</TableCell>
                      {salesCells(l).map((v, i) => <TableCell key={i} className={`text-right tabular-nums ${i === 8 && v < -0.5 ? "text-negative" : ""}`}>{l.jours ? fmt(v) : "—"}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {kind === "hebdo" && (
            <Card className="glass-card max-w-2xl">
              <CardHeader className="pb-2"><CardTitle className="text-base">Récapitulatif des bons, tickets valeur, cartes et MoMo Pay</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {sheet.vouchers.lines.map((l) => <TableRow key={l.label}><TableCell>{l.label}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.montant)}</TableCell></TableRow>)}
                    {([["Total bons + tickets valeur + cartes + MoMo Pay", sheet.vouchers.totalDeductions, true], ["Versement banque", sheet.vouchers.versementBanque], ["Total", sheet.vouchers.total, true], ["Vente de la période", sheet.vouchers.vente], ["Écart (total − vente)", sheet.vouchers.ecart, true]] as [string, number, boolean?][]).map(([l, v, b]) => (
                      <TableRow key={l} className={b ? "bg-muted/30 font-semibold" : ""}><TableCell>{l}</TableCell><TableCell className={`text-right tabular-nums ${l.startsWith("Écart") && v < -0.5 ? "text-negative" : ""}`}>{fmt(v)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
