import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Archive, Ban, Download, FileText, Loader2, Lock, Network, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useBranding } from "@/hooks/useBranding";
import { useCountry } from "@/hooks/useCountry";
import { useDayPrices } from "@/hooks/useIndexDailyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays } from "@/lib/reports";
import { missingDays, pumpSummaries, type PumpRow } from "@/lib/managerAccount";
import {
  localDay, monthlyDeliveries, periodSales, tankLines, valuation, weeklyPeriods,
  type ClosingEntry, type ClosingReading, type ClosingReception, type ClosingTank,
} from "@/lib/accountClosing";
import {
  MOTIFS, SALE_HEADERS, TANK_HEADERS, dateFr, exportNetworkPdf, exportNetworkXlsx, exportStationPdf, exportStationXlsx,
  type Motif, type NetworkClosing, type StationClosing,
} from "@/lib/accountClosingExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtL = (v: number) => fmt(v, 2);
const neg = (v: number) => (v < 0 ? "text-negative" : v > 0 ? "text-warning" : "");

async function fetchAll<T>(build: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const all: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

interface ArchivedClosing {
  id: string; reference: string; station_id: string; motif: Motif; gerant: string; gerant_entrant: string | null; date_reprise: string | null;
  prev_control: string; control_date: string; status: "valide" | "annule"; validated_by_name: string | null; validated_at: string;
  cancelled_by_name: string | null; cancelled_at: string | null; cancel_reason: string | null; snapshot: StationClosing;
}

const archivedSnapshot = (a: ArchivedClosing): StationClosing => ({
  ...a.snapshot,
  validation: { reference: a.reference, by: a.validated_by_name ?? "—", at: a.validated_at, cancelled: a.status === "annule" ? `${a.cancel_reason ?? ""} (${a.cancelled_by_name ?? ""})` : null },
});

export default function AccountClosing() {
  const { tenantId, countryId, scopeQuery } = useScope();
  const brand = useBranding();
  const { country } = useCountry();
  const tz = country?.timezone || "Africa/Porto-Novo";
  const qc = useQueryClient();

  const [mode, setMode] = useState<"station" | "network">("station");
  const [stationId, setStationId] = useState("");
  const [prevControl, setPrevControl] = useState(addDays(yesterday.slice(0, 8) + "01", -1));
  const [control, setControl] = useState(yesterday);
  const [motif, setMotif] = useState<Motif>("periodique");
  const [gerant, setGerant] = useState("");
  const [gerantEntrant, setGerantEntrant] = useState("");
  const [dateReprise, setDateReprise] = useState("");
  const [includePending, setIncludePending] = useState(false);
  const [puS, setPuS] = useState("");
  const [puG, setPuG] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ArchivedClosing | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const from = prevControl ? addDays(prevControl, 1) : "";
  const to = control;
  const rangeOk = !!prevControl && !!control && prevControl < control;

  const { data: stations = [] } = useQuery({
    queryKey: ["closing-stations", tenantId, countryId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await scopeQuery(db.from("stations").select("id,name")).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  useEffect(() => { if (!stationId && stations.length) setStationId(stations[0].id); }, [stations, stationId]);
  const station = stations.find((s) => s.id === stationId);

  // Archive des arrêtés de la station : le dernier validé fixe le point de départ du suivant
  const { data: archive = [] } = useQuery({
    queryKey: ["account-closings", tenantId, countryId, stationId],
    enabled: !!tenantId && !!stationId,
    queryFn: async () => {
      const { data, error } = await scopeQuery(db.from("account_closings").select("*")).eq("station_id", stationId).order("control_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ArchivedClosing[];
    },
  });
  const lastValid = archive.find((a) => a.status === "valide");
  useEffect(() => {
    if (lastValid) {
      setPrevControl(lastValid.control_date);
      setGerant(lastValid.gerant_entrant || lastValid.gerant);
      setDateReprise(lastValid.motif === "gerance" ? addDays(lastValid.control_date, 1) : lastValid.date_reprise ?? "");
    } else {
      setGerant(""); setDateReprise("");
    }
    setGerantEntrant(""); setMotif("periodique");
  }, [stationId, lastValid?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: dayPrices } = useDayPrices(rangeOk ? to : undefined);
  useEffect(() => {
    if (dayPrices) { setPuS(String(dayPrices.super)); setPuG(String(dayPrices.gasoil)); }
  }, [dayPrices?.super, dayPrices?.gasoil]); // eslint-disable-line react-hooks/exhaustive-deps
  const prices = { super: Number(puS.replace(",", ".")) || 0, gasoil: Number(puG.replace(",", ".")) || 0 };

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["account-closing-data", tenantId, countryId, mode, mode === "station" ? stationId : "all", from, to, includePending, tz],
    enabled: !!tenantId && rangeOk && (mode === "network" || !!stationId),
    queryFn: async () => {
      const one = mode === "station";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const st = (q: any) => (one ? q.eq("station_id", stationId) : q);
      const statuses = includePending ? ["valide", "pre_enregistre"] : ["valide"];
      const entries = await fetchAll<ClosingEntry & { id: string }>((a, b) =>
        st(scopeQuery(db.from("index_entries").select("id,station_id,entry_date,vente_globale,autoconso_montant,bons_clients_montant,tickets_valeur_montant,cartes_montant,versement_momo,versement_banque")))
          .gte("entry_date", from).lte("entry_date", to).in("status", statuses).order("entry_date").range(a, b));
      const ids = new Set(entries.map((e) => e.id));
      const [readings, recRaw, tanks, pumpsRaw, pumpNames] = await Promise.all([
        fetchAll<ClosingReading & { entry_id: string }>((a, b) =>
          st(scopeQuery(db.from("index_tank_readings").select("entry_id,entry_date,station_id,tank_id,stock_ouverture,sortie,jauge")))
            .gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Record<string, unknown>>((a, b) =>
          st(scopeQuery(db.from("supply_requests").select("station_id,tank_id,reference,bl_number,qty_loaded,qty_received,received_at")))
            .eq("status", "received").gte("received_at", addDays(from, -1)).lt("received_at", addDays(to, 2)).order("received_at").range(a, b)),
        st(scopeQuery(db.from("tanks").select("id,name,product_type,station_id"))).then((r: { data: ClosingTank[] | null }) => r.data ?? []),
        one
          ? fetchAll<PumpRow & { entry_id: string }>((a, b) =>
              scopeQuery(db.from("pump_index_entries").select("entry_id,entry_date,pump_id,product_type,index_depart,index_arrivee,retour_cuve"))
                .eq("station_id", stationId).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b))
          : Promise.resolve([] as (PumpRow & { entry_id: string })[]),
        one
          ? scopeQuery(db.from("pumps").select("id,name,position")).eq("station_id", stationId).then((r: { data: { id: string; name: string; position: number | null }[] | null }) => r.data ?? [])
          : Promise.resolve([] as { id: string; name: string; position: number | null }[]),
      ]);
      const receptions: ClosingReception[] = recRaw
        .map((r) => ({
          date: localDay(String(r.received_at), tz), station_id: String(r.station_id), tank_id: (r.tank_id as string) ?? null,
          reference: r.reference as string, bl_number: r.bl_number as string,
          qty_loaded: r.qty_loaded as number, qty_received: r.qty_received as number,
        }))
        .filter((r) => r.date >= from && r.date <= to);
      return {
        entries,
        readings: readings.filter((r) => ids.has(r.entry_id)),
        receptions, tanks: tanks as ClosingTank[],
        pumps: pumpsRaw.filter((p) => ids.has(p.entry_id)),
        pumpNames: new Map<string, { id: string; name: string; position: number | null }>(pumpNames.map((p: { id: string; name: string; position: number | null }) => [p.id, p])),
      };
    },
  });

  const stationClosing: StationClosing | null = useMemo(() => {
    if (!data || mode !== "station" || !station) return null;
    const used = (t: ClosingTank) => data.readings.some((r) => r.tank_id === t.id) || data.receptions.some((r) => r.tank_id === t.id);
    const tks = data.tanks.filter(used);
    const tanks = tankLines(tks.length ? tks : data.tanks, data.readings, data.receptions, prices);
    const pumps = pumpSummaries(data.pumps)
      .map((p) => ({ ...p, name: data.pumpNames.get(p.pump_id)?.name ?? "Pompe", pos: data.pumpNames.get(p.pump_id)?.position ?? 0 }))
      .sort((a, b) => (a.fuel === b.fuel ? a.name.localeCompare(b.name, "fr", { numeric: true }) : a.fuel === "super" ? -1 : 1))
      .map(({ pos: _pos, ...p }) => p);
    const sales = periodSales(data.entries, weeklyPeriods(from, to));
    return {
      company: brand.companyName, stationName: station.name, motif, gerant: gerant.trim(), gerantEntrant: gerantEntrant.trim(), dateReprise,
      prevControl, control, includePending, prices, tanks,
      deliveries: monthlyDeliveries(data.receptions, from, to), sales, pumps,
      valuation: valuation(tanks, sales.total.montant),
      missing: missingDays(from, to, data.entries),
    };
  }, [data, mode, station, prices.super, prices.gasoil, motif, gerant, gerantEntrant, dateReprise, prevControl, control, includePending, from, to, brand.companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  const networkClosing: NetworkClosing | null = useMemo(() => {
    if (!data || mode !== "network") return null;
    const periods = [{ from, to, label: "TOTAL" }];
    return {
      company: brand.companyName, prevControl, control, includePending,
      stations: stations
        .map((s) => {
          const tks = data.tanks.filter((t) => t.station_id === s.id);
          const rd = data.readings.filter((r) => r.station_id === s.id);
          const rc = data.receptions.filter((r) => r.station_id === s.id);
          const es = data.entries.filter((e) => e.station_id === s.id);
          if (!rd.length && !rc.length && !es.length) return null;
          return { name: s.name, tanks: tankLines(tks.filter((t) => rd.some((r) => r.tank_id === t.id) || rc.some((r) => r.tank_id === t.id)), rd, rc, prices), sales: periodSales(es, periods).total };
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    };
  }, [data, mode, stations, prices.super, prices.gasoil, prevControl, control, includePending, from, to, brand.companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevLocked = !!lastValid && mode === "station";
  const canArchive = !!stationClosing && !!gerant.trim() && (motif !== "gerance" || !!gerantEntrant.trim()) && prices.super > 0 && prices.gasoil > 0;

  const archiveClosing = async () => {
    if (!stationClosing) return;
    setBusy(true);
    const { error: err } = await db.rpc("account_closing_action", {
      _action: "validate",
      _data: {
        station_id: stationId, motif, gerant: gerant.trim(), gerant_entrant: gerantEntrant.trim(), date_reprise: dateReprise || null,
        prev_control: prevControl, control_date: control, include_pending: includePending,
        price_super: prices.super, price_gasoil: prices.gasoil,
        tank_gauges: Object.fromEntries(stationClosing.tanks.map((t) => [t.tankId, t.jauge])),
        totals: { ...stationClosing.valuation, lines: undefined, ventes: stationClosing.sales.total.montant, versements: stationClosing.sales.total.versementBanque, ecartVersement: stationClosing.sales.total.ecart },
        snapshot: stationClosing,
      },
    });
    setBusy(false);
    if (err) return toast.error(err.message);
    toast.success("Arrêté validé, archivé et verrouillé");
    setConfirm(false);
    qc.invalidateQueries({ queryKey: ["account-closings"] });
  };

  const cancelClosing = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    const { error: err } = await db.rpc("account_closing_action", { _action: "cancel", _data: { id: cancelTarget.id, reason: reason.trim() } });
    setBusy(false);
    if (err) return toast.error(err.message);
    toast.success("Arrêté annulé (conservé dans l'historique)");
    setCancelTarget(null); setReason("");
    qc.invalidateQueries({ queryKey: ["account-closings"] });
  };

  const s = stationClosing;
  return (
    <div className="space-y-5">
      <Card className="glass-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={mode === "station" ? "default" : "outline"} className="gap-2" onClick={() => setMode("station")}><Store className="w-4 h-4" />Fiche station</Button>
            <Button size="sm" variant={mode === "network" ? "default" : "outline"} className="gap-2" onClick={() => setMode("network")}><Network className="w-4 h-4" />Bilan réseau</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            {mode === "station" && (
              <div className="space-y-1.5">
                <Label>Station</Label>
                <Select value={stationId} onValueChange={setStationId}>
                  <SelectTrigger><SelectValue placeholder="Choisir une station" /></SelectTrigger>
                  <SelectContent>{stations.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ac-prev" className="flex items-center gap-1">Date du contrôle précédent {prevLocked && <Lock className="w-3 h-3 text-muted-foreground" />}</Label>
              <Input id="ac-prev" type="date" value={prevControl} max={control} disabled={prevLocked} onChange={(e) => setPrevControl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-ctrl">Date du contrôle actuel</Label>
              <Input id="ac-ctrl" type="date" value={control} min={prevControl} max={yesterday} onChange={(e) => setControl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="ac-pus">PU Super</Label><Input id="ac-pus" inputMode="decimal" value={puS} onChange={(e) => setPuS(e.target.value.replace(/[^0-9.,]/g, ""))} /></div>
              <div className="space-y-1.5"><Label htmlFor="ac-pug">PU Gasoil</Label><Input id="ac-pug" inputMode="decimal" value={puG} onChange={(e) => setPuG(e.target.value.replace(/[^0-9.,]/g, ""))} /></div>
            </div>
          </div>
          {mode === "station" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-1.5">
                <Label>Motif</Label>
                <Select value={motif} onValueChange={(v) => setMotif(v as Motif)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(MOTIFS) as Motif[]).map((k) => <SelectItem key={k} value={k}>{MOTIFS[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ac-ger">{motif === "gerance" ? "Gérant sortant" : "Gérant"}</Label><Input id="ac-ger" value={gerant} onChange={(e) => setGerant(e.target.value)} placeholder="Nom et prénoms" /></div>
              {motif === "gerance" && <div className="space-y-1.5"><Label htmlFor="ac-gent">Gérant entrant</Label><Input id="ac-gent" value={gerantEntrant} onChange={(e) => setGerantEntrant(e.target.value)} placeholder="Nom et prénoms" /></div>}
              <div className="space-y-1.5"><Label htmlFor="ac-rep">Date de prise de la station</Label><Input id="ac-rep" type="date" value={dateReprise} onChange={(e) => setDateReprise(e.target.value)} /></div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer"><Switch checked={includePending} onCheckedChange={setIncludePending} />Inclure les saisies en attente de validation N+1</label>
            {rangeOk && <span>Période contrôlée : du {dateFr(from)} au {dateFr(to)}</span>}
            {dayPrices && <span>PU proposés : {dayPrices.source}</span>}
            {prevLocked && <span>Départ repris du dernier arrêté validé ({lastValid!.reference}).</span>}
            {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={mode === "station" ? !s : !networkClosing} onClick={() => void (mode === "station" ? exportStationXlsx(s!) : exportNetworkXlsx(networkClosing!))}><Download className="w-4 h-4" />Excel</Button>
            <Button variant="outline" className="gap-2" disabled={mode === "station" ? !s : !networkClosing} onClick={() => (mode === "station" ? exportStationPdf(s!) : exportNetworkPdf(networkClosing!))}><FileText className="w-4 h-4" />PDF</Button>
            {mode === "station" && <Button className="gap-2" disabled={!canArchive} onClick={() => setConfirm(true)}><Archive className="w-4 h-4" />Valider et archiver</Button>}
          </div>
          {!rangeOk && <p className="text-sm text-negative">La date du contrôle actuel doit suivre celle du contrôle précédent.</p>}
          {mode === "station" && s && !canArchive && <p className="text-xs text-muted-foreground">Pour archiver : nom du gérant{motif === "gerance" ? " sortant et entrant" : ""} et prix de valorisation obligatoires.</p>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-negative">Données indisponibles : {(error as Error).message}</p>}
      {isLoading && rangeOk && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}

      {mode === "station" && s && (
        <>
          {s.missing.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
              <span>{s.missing.length} jour(s) sans saisie {includePending ? "retenue" : "validée N+1"} sur la période{s.missing.length <= 8 ? ` : ${s.missing.map(dateFr).join(", ")}` : ""}.</span>
            </div>
          )}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">E. Écarts sur stock par cuve (litres)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader><TableRow><TableHead>Cuve</TableHead>{TANK_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {s.tanks.map((t) => (
                    <TableRow key={t.tankId}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(t.stockInitial)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(t.approv)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(t.sortie)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(t.theorique)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(t.jauge)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${neg(t.ecart)}`}>{fmtL(t.ecart)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${neg(t.ecartValorise)}`}>{fmt(t.ecartValorise)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-semibold"><TableCell colSpan={7}>Total écarts valorisés (FCFA)</TableCell><TableCell className={`text-right tabular-nums ${neg(s.valuation.sommeEcartsValorises)}`}>{fmt(s.valuation.sommeEcartsValorises)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">A. Livraisons (volume BL)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Mois</TableHead><TableHead className="text-right">BL</TableHead>{s.tanks.map((t) => <TableHead key={t.tankId} className="text-right">{t.name}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {s.deliveries.rows.length === 0 && <TableRow><TableCell colSpan={2 + s.tanks.length} className="text-muted-foreground">Aucune réception validée sur la période.</TableCell></TableRow>}
                    {s.deliveries.rows.map((m) => (
                      <TableRow key={m.month}><TableCell>{m.label} <span className="text-xs text-muted-foreground">{dateFr(m.from)} – {dateFr(m.to)}</span></TableCell><TableCell className="text-right">{m.nbBl}</TableCell>{s.tanks.map((t) => <TableCell key={t.tankId} className="text-right tabular-nums">{fmt(m.byTank[t.tankId] ?? 0)}</TableCell>)}</TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold"><TableCell>Total des chargements</TableCell><TableCell className="text-right">{s.deliveries.total.nbBl}</TableCell>{s.tanks.map((t) => <TableCell key={t.tankId} className="text-right tabular-nums">{fmt(s.deliveries.total.byTank[t.tankId] ?? 0)}</TableCell>)}</TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">B. Valorisation et balance (FCFA)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {s.valuation.lines.filter((l) => l.qty).map((l) => <TableRow key={l.label}><TableCell>{l.label} <span className="text-xs text-muted-foreground">{fmtL(l.qty)} L × {fmt(l.pu)}</span></TableCell><TableCell className="text-right tabular-nums">{fmt(l.montant)}</TableCell></TableRow>)}
                    {([["Approvisionnement valorisé", s.valuation.approvisionnement, true], ["− Ventes sur index (montants du jour)", s.valuation.ventes], ["= Balance", s.valuation.balance, true], ["Stock contrôle valorisé (jauges × PU)", s.valuation.stockControle]] as [string, number, boolean?][]).map(([l, v, b]) => (
                      <TableRow key={l} className={b ? "bg-muted/30 font-semibold" : ""}><TableCell>{l}</TableCell><TableCell className="text-right tabular-nums">{fmt(v)}</TableCell></TableRow>
                    ))}
                    <TableRow className="font-semibold"><TableCell>Écart (stock contrôle − balance)</TableCell><TableCell className={`text-right tabular-nums ${neg(s.valuation.ecart)}`}>{fmt(s.valuation.ecart)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">C. Ventes et versements périodiques (FCFA)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader><TableRow><TableHead>Période</TableHead>{SALE_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {[...s.sales.rows, s.sales.total].map((p) => (
                    <TableRow key={p.label} className={p.label === "TOTAL" ? "bg-muted/30 font-semibold" : ""}>
                      <TableCell className="whitespace-nowrap">{p.label}</TableCell>
                      {[p.montant, p.bonsSociete, p.bonsClients, p.tickets, p.cartes, p.venteReelle, p.momo, p.liquidite, p.versementBanque].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{fmt(v)}</TableCell>)}
                      <TableCell className={`text-right tabular-nums ${p.ecart < -0.5 ? "text-negative" : ""}`}>{fmt(p.ecart, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">D. Index et sorties de la période</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader><TableRow><TableHead>Pompe</TableHead><TableHead className="text-right">Index arrivée</TableHead><TableHead className="text-right">Index départ</TableHead><TableHead className="text-right">Sorties</TableHead><TableHead className="text-right">Retour cuve</TableHead><TableHead className="text-right">Sortie réelle</TableHead><TableHead className="text-right">Montant (PU)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {s.pumps.map((p) => { const pu = p.fuel === "super" ? prices.super : p.fuel === "gasoil" ? prices.gasoil : 0; return (
                    <TableRow key={p.pump_id}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.indexFin)}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.indexDebut)}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.brut)}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.retour)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmtL(p.net)}</TableCell><TableCell className="text-right tabular-nums">{fmt(p.net * pu)}</TableCell></TableRow>
                  ); })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {mode === "network" && networkClosing && (
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Bilan du contrôle des stations — du {dateFr(from)} au {dateFr(to)}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto space-y-6">
            <Table className="min-w-[960px]">
              <TableHeader><TableRow><TableHead>Station</TableHead><TableHead>Cuve</TableHead>{TANK_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {networkClosing.stations.flatMap((st) => st.tanks.map((t, i) => (
                  <TableRow key={t.tankId}>
                    <TableCell className="font-medium">{i === 0 ? st.name : ""}</TableCell><TableCell>{t.name}</TableCell>
                    {[t.stockInitial, t.approv, t.sortie, t.theorique, t.jauge].map((v, j) => <TableCell key={j} className="text-right tabular-nums">{fmtL(v)}</TableCell>)}
                    <TableCell className={`text-right tabular-nums font-semibold ${neg(t.ecart)}`}>{fmtL(t.ecart)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${neg(t.ecartValorise)}`}>{fmt(t.ecartValorise)}</TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
            <Table className="min-w-[960px]">
              <TableHeader><TableRow><TableHead>Station</TableHead>{SALE_HEADERS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {networkClosing.stations.map((st) => (
                  <TableRow key={st.name}><TableCell className="font-medium">{st.name}</TableCell>{[st.sales.montant, st.sales.bonsSociete, st.sales.bonsClients, st.sales.tickets, st.sales.cartes, st.sales.venteReelle, st.sales.momo, st.sales.liquidite, st.sales.versementBanque, st.sales.ecart].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{fmt(v)}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
            {networkClosing.stations.length === 0 && <p className="text-sm text-muted-foreground">Aucune saisie retenue sur la période.</p>}
          </CardContent>
        </Card>
      )}

      {mode === "station" && (
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Archive className="w-4 h-4 text-primary" />Arrêtés archivés — {station?.name ?? ""}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {archive.length === 0 ? <p className="text-sm text-muted-foreground">Aucun arrêté archivé pour cette station.</p> : (
              <Table className="min-w-[900px]">
                <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Période</TableHead><TableHead>Motif</TableHead><TableHead>Gérant</TableHead><TableHead className="text-right">Écart valorisé</TableHead><TableHead>Validé par</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {archive.map((a) => (
                    <TableRow key={a.id} className={a.status === "annule" ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{a.reference}</TableCell>
                      <TableCell className="whitespace-nowrap">{dateFr(addDays(a.prev_control, 1))} → {dateFr(a.control_date)}</TableCell>
                      <TableCell>{MOTIFS[a.motif]}</TableCell>
                      <TableCell>{a.gerant}{a.gerant_entrant ? ` → ${a.gerant_entrant}` : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(a.snapshot?.valuation?.sommeEcartsValorises)}</TableCell>
                      <TableCell className="text-xs">{a.validated_by_name ?? "—"}<br />{new Date(a.validated_at).toLocaleString("fr-FR")}</TableCell>
                      <TableCell>
                        {a.status === "valide"
                          ? <Badge variant="outline" className="gap-1 bg-success/15 text-success border-success/30"><Lock className="w-3 h-3" />Validé</Badge>
                          : <Badge variant="outline" className="bg-muted text-muted-foreground" title={a.cancel_reason ?? ""}>Annulé · {a.cancelled_by_name}</Badge>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button size="sm" variant="ghost" title="PDF" onClick={() => exportStationPdf(archivedSnapshot(a))}><FileText className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" title="Excel" onClick={() => void exportStationXlsx(archivedSnapshot(a))}><Download className="w-4 h-4" /></Button>
                        {a.status === "valide" && a.id === lastValid?.id && <Button size="sm" variant="ghost" className="text-destructive" title="Annuler" onClick={() => setCancelTarget(a)}><Ban className="w-4 h-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider et archiver l'arrêté</DialogTitle>
            <DialogDescription>
              {station?.name} · du {dateFr(from)} au {dateFr(to)} · {MOTIFS[motif]}. L'arrêté sera enregistré à votre nom et verrouillé :
              plus aucune modification possible. Le prochain arrêté de la station partira du {dateFr(control)}.
            </DialogDescription>
          </DialogHeader>
          {s && <p className="text-sm">Écart valorisé : <span className={`font-semibold ${neg(s.valuation.sommeEcartsValorises)}`}>{fmt(s.valuation.sommeEcartsValorises)} FCFA</span> · Écart de versement : {fmt(s.sales.total.ecart, 2)} FCFA</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Retour</Button>
            <Button disabled={busy} onClick={() => void archiveClosing()} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Valider et archiver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler l'arrêté {cancelTarget?.reference}</DialogTitle>
            <DialogDescription>L'arrêté reste visible dans l'historique avec la mention « Annulé ». Le motif est obligatoire.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif de l'annulation" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Retour</Button>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => void cancelClosing()}>Annuler l'arrêté</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
