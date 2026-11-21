import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays } from "@/lib/reports";
import { missingDays } from "@/lib/managerAccount";
import { interleaveFuels, inventoryCash, inventoryTanks, pumpRecap, salesLine } from "@/lib/ecap";
import { dateFr } from "@/lib/accountClosingExport";
import { CASH_HEADERS, TANK_INV_HEADERS, cashCells, exportInventoryPdf, exportInventoryXlsx, tankInvCells, type InventorySheet as Sheet } from "@/lib/ecapExport";
import { forStation, useScopedStations, useSynthesisPeriod } from "./useSynthesisPeriod";
import { useLastGerant } from "./useLastGerant";
import { PumpTable } from "./PumpTable";

const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
const fmt = (v: number, d = 0) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const neg = (v: number) => (v < -0.005 ? "text-negative" : v > 0.005 ? "text-warning" : "");

/** Fiche des données d'inventaire périodique : pompes, cuves, ventes/bons/monétique et caisse comptée. */
export default function InventorySheet() {
  const brand = useBranding();
  const [stationId, setStationId] = useState("");
  const [from, setFrom] = useState(yesterday);
  const [to, setTo] = useState(yesterday);
  const [includePending, setIncludePending] = useState(false);
  const [heureDe, setHeureDe] = useState("");
  const [heureA, setHeureA] = useState("");
  const [gerant, setGerant] = useState("");
  const [ctrl, setCtrl] = useState(["", "", ""]);
  const [observation, setObservation] = useState("");
  const [especes, setEspeces] = useState<string | null>(null);

  const { data: stations = [] } = useScopedStations();
  useEffect(() => { if (!stationId && stations.length) setStationId(stations[0].id); }, [stations, stationId]);
  const station = stations.find((s) => s.id === stationId);
  const { data: lastGerant } = useLastGerant(stationId);
  useEffect(() => { setGerant(lastGerant ?? ""); }, [stationId, lastGerant]);
  useEffect(() => { setEspeces(null); }, [stationId, from, to, includePending]);

  const rangeOk = !!from && !!to && from <= to;
  const { data, isLoading, isFetching, error } = useSynthesisPeriod(rangeOk ? from : "", rangeOk ? to : "", includePending);

  const base = useMemo(() => {
    if (!data || !station) return null;
    const d = forStation(data, station.id);
    const used = d.tanks.filter((t) => d.readings.some((r) => r.tank_id === t.id) || d.receptions.some((r) => r.tank_id === t.id));
    return {
      pumps: pumpRecap(d.pumps, data.pumpNames, data.price),
      tanks: inventoryTanks(used.length ? used : d.tanks, d.readings, d.receptions),
      total: salesLine("TOTAL", from, to, d.entries),
      missing: missingDays(from, to, d.entries),
    };
  }, [data, station, from, to]);

  const especesValue = especes == null ? base?.total.versementBanque ?? 0 : Number(especes.replace(/\s/g, "").replace(",", ".")) || 0;
  const sheet: Sheet | null = base && station ? {
    stationName: station.name, from, to, heureDe, heureA, gerant: gerant.trim(), controleurs: ctrl.map((c) => c.trim()), observation: observation.trim(), includePending,
    pumps: base.pumps, tanks: base.tanks, cash: inventoryCash(base.pumps.totalMontant, base.total, especesValue), venteSaisie: base.total.vente, missing: base.missing,
  } : null;
  const gap = sheet ? Math.abs(sheet.pumps.totalMontant - sheet.venteSaisie) : 0;

  return (
    <div className="space-y-5">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-1.5">
              <Label>Station</Label>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger><SelectValue placeholder="Choisir une station" /></SelectTrigger>
                <SelectContent>{stations.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="inv-from">Du</Label><Input id="inv-from" type="date" value={from} max={to || yesterday} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="inv-to">Au (date du relevé)</Label><Input id="inv-to" type="date" value={to} min={from} max={yesterday} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="inv-h1">Heure de</Label><Input id="inv-h1" type="time" value={heureDe} onChange={(e) => setHeureDe(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="inv-h2">à</Label><Input id="inv-h2" type="time" value={heureA} onChange={(e) => setHeureA(e.target.value)} /></div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div className="space-y-1.5"><Label htmlFor="inv-ger">Gérant</Label><Input id="inv-ger" value={gerant} onChange={(e) => setGerant(e.target.value)} placeholder="Nom et prénoms" /></div>
            {ctrl.map((c, i) => (
              <div key={i} className="space-y-1.5"><Label htmlFor={`inv-c${i}`}>Contrôleur {i + 1}</Label><Input id={`inv-c${i}`} value={c} onChange={(e) => setCtrl(ctrl.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Nom" /></div>
            ))}
            <div className="space-y-1.5"><Label htmlFor="inv-esp">Espèces comptées (FCFA)</Label><Input id="inv-esp" inputMode="decimal" value={especes ?? String(base?.total.versementBanque ?? "")} onChange={(e) => setEspeces(e.target.value.replace(/[^0-9.,\s]/g, ""))} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="inv-obs">Observation</Label><Textarea id="inv-obs" rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} /></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={includePending} onCheckedChange={setIncludePending} />Inclure les saisies en attente de validation N+1</label>
            <span>Dépotages au volume BL des réceptions validées. Espèces comptées proposées = versements banque de la période (modifiable).</span>
            {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={!sheet} onClick={() => void exportInventoryXlsx(sheet!, brand.companyName)}><Download className="w-4 h-4" />Excel</Button>
            <Button variant="outline" className="gap-2" disabled={!sheet} onClick={() => exportInventoryPdf(sheet!)}><FileText className="w-4 h-4" />PDF</Button>
          </div>
          {!rangeOk && <p className="text-sm text-negative">La date de début doit précéder la date du relevé.</p>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-negative">Données indisponibles : {(error as Error).message}</p>}
      {isLoading && rangeOk && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}

      {sheet && (
        <>
          {sheet.missing.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
              <span>{sheet.missing.length} jour(s) sans saisie {includePending ? "retenue" : "validée N+1"}{sheet.missing.length <= 8 ? ` : ${sheet.missing.map(dateFr).join(", ")}` : ""}.</span>
            </div>
          )}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Partie 1 — Relevé des données sur pompes</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto"><PumpTable recap={sheet.pumps} withAmounts={false} /></CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Partie 2 — Relevé des données sur cuves (litres)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader><TableRow><TableHead>Cuve</TableHead>{TANK_INV_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {sheet.tanks.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Aucun bilan de cuve retenu sur la période.</TableCell></TableRow>}
                  {sheet.tanks.map((t) => (
                    <TableRow key={t.tankId}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      {tankInvCells(t).map((v, i) => <TableCell key={i} className={`text-right tabular-nums ${i === 6 ? `font-semibold ${neg(v)}` : ""}`}>{fmt(v, 2)}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Partie 3 — Ventes, bons et monétique (FCFA)</CardTitle></CardHeader>
            <CardContent className="space-y-4 overflow-x-auto">
              <Table className="max-w-2xl">
                <TableHeader><TableRow><TableHead>Pompe</TableHead><TableHead className="text-right">Sortie réelle</TableHead><TableHead className="text-right">PU</TableHead><TableHead className="text-right">Montant</TableHead></TableRow></TableHeader>
                <TableBody>
                  {interleaveFuels(sheet.pumps.lines).map((l) => (
                    <TableRow key={l.pumpId}><TableCell className="font-medium">{l.name}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.net, 2)}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.net ? l.montant / l.net : 0)}</TableCell><TableCell className="text-right tabular-nums">{fmt(l.montant)}</TableCell></TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-semibold"><TableCell colSpan={3}>Cumul montant</TableCell><TableCell className="text-right tabular-nums">{fmt(sheet.pumps.totalMontant)}</TableCell></TableRow>
                </TableBody>
              </Table>
              <Table className="min-w-[980px]">
                <TableHeader><TableRow>{CASH_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  <TableRow className="font-semibold">{cashCells(sheet.cash).map((v, i) => <TableCell key={i} className={`text-right tabular-nums ${i === 8 ? neg(v) : ""}`}>{fmt(v)}</TableCell>)}</TableRow>
                </TableBody>
              </Table>
              {gap > 1 && <p className="text-xs text-muted-foreground">Vente enregistrée sur les saisies : {fmt(sheet.venteSaisie)} FCFA (écart de {fmt(sheet.pumps.totalMontant - sheet.venteSaisie)} avec le montant des pistolets au prix du jour).</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
