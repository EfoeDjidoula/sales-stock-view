import { useMemo, useState } from "react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import ExcelJS from "exceljs";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useBiDataset } from "@/lib/metrics/useBiDataset";
import {
  CHANNEL_LABELS, buildSaleFacts, channelBreakdown, computeKpis, deltaPct, filterFacts, groupFacts, previousRange, stationPerformance,
  type Channel, type Filters, type Kind,
} from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Download, X } from "lucide-react";
import { toast } from "sonner";

const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: d }));
const PRESETS = { "7d": 6, "30d": 29, "90d": 89 } as const;

export function BiModule() {
  const { tenantId } = useTenant() as any;
  const { countries } = useCountry();
  const { t } = useLanguage();
  const { can } = usePermissions();
  const today = format(new Date(), "yyyy-MM-dd");
  const [start, setStart] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [end, setEnd] = useState(today);
  const [country, setCountry] = useState("all");
  const [zone, setZone] = useState("all");
  const [station, setStation] = useState("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [channel, setChannel] = useState<"all" | Channel>("all");
  const [client, setClient] = useState("all");

  const allowed = useMemo(() => countries.map((c) => c.id), [countries]);
  const scope = country !== "all" && allowed.includes(country) ? [country] : allowed;
  const prev = previousRange(start, end > today ? today : end);
  const e = end > today ? today : end;
  const q = useBiDataset(tenantId, scope, prev.start, e);
  const d = q.data;

  const filters: Filters = {
    start, end: e, zoneId: zone === "all" ? null : zone, stationId: station === "all" ? null : station,
    kind: kind === "all" ? null : kind, channel: channel === "all" ? null : channel, clientId: client === "all" ? null : client,
  };
  const view = useMemo(() => {
    if (!d) return null;
    const k = computeKpis(d, filters, today);
    const kp = computeKpis(d, { ...filters, ...prev }, today);
    const facts = filterFacts(buildSaleFacts(d, filters), filters);
    const trend = groupFacts(facts, (f) => f.date).sort((a, b) => a.key.localeCompare(b.key));
    const stations = d.stations.filter((s) => s.status !== "inactive" && (!filters.zoneId || (s.zone_id ?? "none") === filters.zoneId) && (!filters.stationId || s.id === filters.stationId));
    const rows = stations.map((s) => ({ s, k: computeKpis(d, { ...filters, stationId: s.id }, today) }));
    const maxVol = Math.max(0, ...rows.map((r) => r.k.volume));
    const countryRows = scope.map((cid) => {
      const sub = { ...d, stations: d.stations.filter((s) => s.country_id === cid) };
      return { cid, k: computeKpis(sub, filters, today) };
    });
    const channels = channelBreakdown(d, filters);
    const clients = (d.clients as any[]).map((c) => ({ c, k: computeKpis(d, { ...filters, clientId: c.id }, today), vol: d.consumptions.filter((x) => x.client_id === c.id && x.consumed_on >= start && x.consumed_on <= e).reduce((s, x) => s + Number(x.litres), 0) }))
      .filter((r) => r.k.receivables > 0 || r.vol > 0);
    return { k, kp, trend, rows: rows.map((r) => ({ ...r, perf: stationPerformance(r.k.volume, maxVol, r.k.compliance, r.k.ruptures) })).sort((a, b) => b.k.amount - a.k.amount), countryRows, channels, clients };
  }, [d, start, e, zone, station, kind, channel, client]); // eslint-disable-line react-hooks/exhaustive-deps

  const cname = (id: string) => countries.find((c) => c.id === id)?.name ?? id;
  const zones = (d?.zones ?? []) as any[];
  const stationList = (d?.stations ?? []).filter((s) => zone === "all" || (s.zone_id ?? "none") === zone);

  const exportXlsx = async () => {
    if (!view) return;
    const wb = new ExcelJS.Workbook();
    const k = wb.addWorksheet(t("Synthèse"));
    k.addRow([t("Période"), `${start} → ${e}`]);
    Object.entries(view.k).forEach(([key, v]) => k.addRow([key, v ?? ""]));
    const s = wb.addWorksheet(t("Stations"));
    s.addRow(["Station", "Pays", "Volume (L)", "CA", "Marge", "Stock (L)", "Rotation", "Ruptures", "Écart valeur", "Disponibilité %", "Conformité", "Performance"]);
    view.rows.forEach(({ s: st, k: x, perf }) => s.addRow([st.name, cname(st.country_id), x.volume, x.amount, x.margin ?? "", x.stock, x.rotation ?? "", x.ruptures, x.varianceValue, x.availability, x.compliance ?? "", perf]));
    const c = wb.addWorksheet(t("Pays"));
    c.addRow(["Pays", "Stations", "Volume (L)", "CA", "Marge", "Stock (L)", "Créances"]);
    view.countryRows.forEach(({ cid, k: x }) => c.addRow([cname(cid), x.stations, x.volume, x.amount, x.margin ?? "", x.stock, x.receivables]));
    const tr = wb.addWorksheet(t("Tendance"));
    tr.addRow(["Date", "Volume (L)", "CA"]);
    view.trend.forEach((r) => tr.addRow([r.key, r.volume, r.amount]));
    const ch = wb.addWorksheet(t("Canaux"));
    ch.addRow(["Canal", "Montant"]);
    view.channels.forEach((r) => ch.addRow([CHANNEL_LABELS[r.channel], r.amount]));
    const b = wb.addWorksheet("B2B");
    b.addRow(["Client", "Litres", "Créance", "En retard"]);
    view.clients.forEach((r) => b.addRow([r.c.name, r.vol, r.k.receivables, r.k.overdue]));
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `BI_${start}_${e}.xlsx`; a.click();
    toast.success(t("Export Excel généré"));
  };

  const Kpi = ({ label, value, unit, cur, prv, hint }: { label: string; value: string; unit?: string; cur?: number; prv?: number; hint?: string }) => {
    const dp = cur != null && prv != null ? deltaPct(cur, prv) : null;
    return (
      <Card className="glass-card"><CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground">{t(label)}</p>
        <p className="text-xl font-semibold">{value}{unit && <span className="text-sm text-muted-foreground"> {unit}</span>}</p>
        {dp != null && <p className={`text-xs ${dp >= 0 ? "text-success" : "text-destructive"}`}>{dp >= 0 ? "▲" : "▼"} {fmt(Math.abs(dp), 1)} % {t("vs période précédente")}</p>}
        {hint && <p className="text-xs text-muted-foreground">{t(hint)}</p>}
      </CardContent></Card>
    );
  };

  const crumbs = [
    country !== "all" && { label: cname(country), clear: () => { setCountry("all"); setZone("all"); setStation("all"); } },
    zone !== "all" && { label: zones.find((z) => z.id === zone)?.name ?? t("Sans zone"), clear: () => { setZone("all"); setStation("all"); } },
    station !== "all" && { label: d?.stations.find((s) => s.id === station)?.name ?? "", clear: () => setStation("all") },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-semibold">{t("BI avancée")}</h2>
          <p className="text-sm text-muted-foreground">{t("Analyses multi-pays limitées à votre société et à vos pays autorisés.")}</p>
        </div>
        {(can("reports", "export") || can("reports", "view")) && (
          <Button onClick={exportXlsx} disabled={!view} className="gap-2"><Download className="w-4 h-4" />{t("Exporter Excel")}</Button>
        )}
      </div>

      <Card className="glass-card"><CardContent className="p-4 grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2 flex gap-1">
          {Object.entries(PRESETS).map(([k, n]) => <Button key={k} size="sm" variant="outline" onClick={() => { setStart(format(subDays(new Date(), n), "yyyy-MM-dd")); setEnd(today); }}>{k}</Button>)}
          <Button size="sm" variant="outline" onClick={() => { setStart(format(startOfMonth(new Date()), "yyyy-MM-dd")); setEnd(today); }}>{t("Mois")}</Button>
          <Button size="sm" variant="outline" onClick={() => { setStart(format(startOfYear(new Date()), "yyyy-MM-dd")); setEnd(today); }}>{t("Année")}</Button>
        </div>
        <Input type="date" value={start} max={e} onChange={(x) => setStart(x.target.value)} aria-label={t("Début")} />
        <Input type="date" value={end} max={today} onChange={(x) => setEnd(x.target.value)} aria-label={t("Fin")} />
        <Select value={country} onValueChange={(v) => { setCountry(v); setZone("all"); setStation("all"); }}>
          <SelectTrigger><SelectValue placeholder={t("Pays")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Tous les pays")}</SelectItem>{countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={zone} onValueChange={(v) => { setZone(v); setStation("all"); }}>
          <SelectTrigger><SelectValue placeholder={t("Zone")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Toutes les zones")}</SelectItem><SelectItem value="none">{t("Sans zone")}</SelectItem>{zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={station} onValueChange={setStation}>
          <SelectTrigger><SelectValue placeholder="Station" /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Toutes les stations")}</SelectItem>{stationList.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Tous produits")}</SelectItem><SelectItem value="super">Super</SelectItem><SelectItem value="gasoil">Gasoil</SelectItem></SelectContent>
        </Select>
        <Select value={channel} onValueChange={(v) => setChannel(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Tous canaux")}</SelectItem>{Object.entries(CHANNEL_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{t(l)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={client} onValueChange={setClient}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("Tous clients B2B")}</SelectItem>{(d?.clients ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent></Card>

      {crumbs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-muted-foreground">{t("Groupe")}</span>
          {crumbs.map((c) => <span key={c.label} className="flex items-center gap-1"><ChevronRight className="w-3 h-3" /><Badge variant="secondary" className="gap-1 cursor-pointer" onClick={c.clear}>{c.label}<X className="w-3 h-3" /></Badge></span>)}
        </div>
      )}

      {q.isLoading || !view ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.error ? (
        <p className="text-destructive">{t("Chargement impossible")}</p>
      ) : (
        <>
          <div className={`grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 ${q.isFetching ? "opacity-60" : ""}`}>
            <Kpi label="Volume vendu" value={fmt(view.k.volume)} unit="L" cur={view.k.volume} prv={view.kp.volume} />
            <Kpi label="Chiffre d'affaires" value={fmt(view.k.amount)} unit="F" cur={view.k.amount} prv={view.kp.amount} />
            <Kpi label="Marge brute" value={fmt(view.k.margin)} unit={view.k.margin == null ? undefined : "F"} hint={view.k.margin == null ? "Structure de prix manquante" : "Marges distributeur + détaillant"} />
            <Kpi label="Stock disponible" value={fmt(view.k.stock)} unit="L" hint={view.k.capacity ? `${fmt((view.k.stock / view.k.capacity) * 100, 1)} % de capacité` : undefined} />
            <Kpi label="Rotation" value={fmt(view.k.rotation, 2)} unit="×" hint={view.k.coverageDays != null ? `Couverture ${fmt(view.k.coverageDays, 1)} j` : undefined} />
            <Kpi label="Ruptures / critiques" value={`${view.k.ruptures} / ${view.k.critical}`} hint="Cuves" />
            <Kpi label="Écarts réconciliés" value={fmt(view.k.varianceValue)} unit="F" hint={`${fmt(view.k.varianceVolume)} L · ${view.k.anomalies} anomalie(s)`} />
            <Kpi label="Créances B2B" value={fmt(view.k.receivables)} unit="F" hint={`En retard : ${fmt(view.k.overdue)} F`} />
            <Kpi label="Disponibilité équipements" value={fmt(view.k.availability, 1)} unit="%" hint={`Coût maintenance ${fmt(view.k.maintenanceCost)} F`} />
            <Kpi label="Conformité HSE" value={fmt(view.k.compliance)} unit={view.k.compliance == null ? undefined : "%"} hint={`${view.k.openCriticalNc} NC critique(s) ouverte(s)`} />
            <Kpi label="Stations" value={String(view.k.stations)} />
          </div>

          <Tabs defaultValue="stations">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="stations">{t("Comparatif stations")}</TabsTrigger>
              <TabsTrigger value="pays">{t("Comparatif pays")}</TabsTrigger>
              <TabsTrigger value="trend">{t("Tendances")}</TabsTrigger>
              <TabsTrigger value="canaux">{t("Canaux")}</TabsTrigger>
              <TabsTrigger value="b2b">{t("Clients B2B")}</TabsTrigger>
            </TabsList>

            <TabsContent value="stations">
              <Card className="glass-card"><CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Station</TableHead><TableHead>{t("Pays")}</TableHead><TableHead className="text-right">{t("Volume")} (L)</TableHead><TableHead className="text-right">CA (F)</TableHead>
                    <TableHead className="text-right">{t("Marge")}</TableHead><TableHead className="text-right">Stock (L)</TableHead><TableHead className="text-right">Rotation</TableHead>
                    <TableHead className="text-right">{t("Écart")} (F)</TableHead><TableHead className="text-right">{t("Dispo.")}</TableHead><TableHead className="text-right">HSE</TableHead><TableHead className="text-right">{t("Performance")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {view.rows.map(({ s, k, perf }) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => { setCountry(s.country_id); setZone(s.zone_id ?? "none"); setStation(s.id); }}>
                        <TableCell className="font-medium">{s.name}</TableCell><TableCell>{cname(s.country_id)}</TableCell>
                        <TableCell className="text-right">{fmt(k.volume)}</TableCell><TableCell className="text-right">{fmt(k.amount)}</TableCell>
                        <TableCell className="text-right">{fmt(k.margin)}</TableCell><TableCell className="text-right">{fmt(k.stock)}{k.ruptures > 0 && <Badge variant="destructive" className="ml-1">{t("Rupture")}</Badge>}</TableCell>
                        <TableCell className="text-right">{fmt(k.rotation, 2)}</TableCell><TableCell className="text-right">{fmt(k.varianceValue)}</TableCell>
                        <TableCell className="text-right">{fmt(k.availability, 1)} %</TableCell><TableCell className="text-right">{fmt(k.compliance)}</TableCell>
                        <TableCell className="text-right"><Badge variant={perf >= 70 ? "default" : perf >= 40 ? "secondary" : "destructive"}>{perf}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {!view.rows.length && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">{t("Aucune station")}</TableCell></TableRow>}
                  </TableBody>
                </Table>
                <p className="p-3 text-xs text-muted-foreground">{t("Performance /100 : volume relatif au meilleur site (50) + conformité HSE (25) + absence de rupture (25). Cliquez une station pour l'analyser.")}</p>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="pays">
              <Card className="glass-card"><CardContent className="p-4 space-y-4">
                <div className="h-64"><ResponsiveContainer><BarChart data={view.countryRows.map((r) => ({ name: cname(r.cid), CA: r.k.amount, Volume: r.k.volume }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" /><YAxis stroke="hsl(var(--muted-foreground))" /><Tooltip /><Legend />
                  <Bar dataKey="CA" fill="hsl(var(--primary))" /><Bar dataKey="Volume" fill="hsl(var(--accent))" />
                </BarChart></ResponsiveContainer></div>
                <Table><TableHeader><TableRow><TableHead>{t("Pays")}</TableHead><TableHead className="text-right">Stations</TableHead><TableHead className="text-right">{t("Volume")} (L)</TableHead><TableHead className="text-right">CA (F)</TableHead><TableHead className="text-right">{t("Marge")}</TableHead><TableHead className="text-right">{t("Créances")}</TableHead></TableRow></TableHeader>
                  <TableBody>{view.countryRows.map(({ cid, k }) => (
                    <TableRow key={cid} className="cursor-pointer" onClick={() => { setCountry(cid); setZone("all"); setStation("all"); }}>
                      <TableCell className="font-medium">{cname(cid)}</TableCell><TableCell className="text-right">{k.stations}</TableCell><TableCell className="text-right">{fmt(k.volume)}</TableCell>
                      <TableCell className="text-right">{fmt(k.amount)}</TableCell><TableCell className="text-right">{fmt(k.margin)}</TableCell><TableCell className="text-right">{fmt(k.receivables)}</TableCell>
                    </TableRow>))}</TableBody></Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="trend">
              <Card className="glass-card"><CardHeader><CardTitle className="text-base">{t("Ventes quotidiennes")}</CardTitle></CardHeader><CardContent className="h-72">
                <ResponsiveContainer><LineChart data={view.trend.map((r) => ({ date: r.key.slice(5), CA: Math.round(r.amount), Volume: Math.round(r.volume) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="a" stroke="hsl(var(--muted-foreground))" /><YAxis yAxisId="v" orientation="right" stroke="hsl(var(--muted-foreground))" /><Tooltip /><Legend />
                  <Line yAxisId="a" dataKey="CA" stroke="hsl(var(--primary))" dot={false} /><Line yAxisId="v" dataKey="Volume" stroke="hsl(var(--accent))" dot={false} />
                </LineChart></ResponsiveContainer>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="canaux">
              <Card className="glass-card"><CardContent className="p-4 space-y-2">
                {view.channels.length === 0 && <p className="text-muted-foreground text-sm">{t("Aucun encaissement sur la période")}</p>}
                {(() => { const tot = view.channels.reduce((s, c) => s + c.amount, 0) || 1; return view.channels.sort((a, b) => b.amount - a.amount).map((c) => (
                  <div key={c.channel} className="space-y-1"><div className="flex justify-between text-sm"><span>{t(CHANNEL_LABELS[c.channel])}</span><span>{fmt(c.amount)} F · {fmt((c.amount / tot) * 100, 1)} %</span></div>
                    <div className="h-2 rounded bg-secondary"><div className="h-2 rounded bg-primary" style={{ width: `${(c.amount / tot) * 100}%` }} /></div></div>)); })()}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="b2b">
              <Card className="glass-card"><CardContent className="p-0 overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">{t("Litres période")}</TableHead><TableHead className="text-right">{t("Créance")} (F)</TableHead><TableHead className="text-right">{t("En retard")} (F)</TableHead></TableRow></TableHeader>
                  <TableBody>{view.clients.map((r) => (
                    <TableRow key={r.c.id} className="cursor-pointer" onClick={() => setClient(r.c.id)}>
                      <TableCell className="font-medium">{r.c.name}</TableCell><TableCell className="text-right">{fmt(r.vol)}</TableCell><TableCell className="text-right">{fmt(r.k.receivables)}</TableCell>
                      <TableCell className="text-right">{r.k.overdue > 0 ? <Badge variant="destructive">{fmt(r.k.overdue)}</Badge> : "0"}</TableCell>
                    </TableRow>))}
                    {!view.clients.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("Aucun client B2B actif")}</TableCell></TableRow>}
                  </TableBody></Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
