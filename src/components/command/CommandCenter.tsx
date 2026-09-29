import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";
import { FUEL_PRICES } from "@/config/prices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Banknote, ChevronRight, Droplets, Fuel, LifeBuoy, MapPin, Package, Truck, TrendingDown, TrendingUp, Activity,
} from "lucide-react";

type Health = "green" | "orange" | "red";
type PeriodKey = "day" | "7d" | "30d" | "month";
const OPEN_SUPPLY = ["submitted", "approved", "ordered", "loaded", "in_transit", "delivered"];
const OPEN_TICKET = ["new", "assigned", "in_progress", "waiting_customer"];
const VAR_TOL = 0.005;

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const HEALTH_CLS: Record<Health, string> = {
  green: "border-success/40 bg-success/10 text-success",
  orange: "border-warning/40 bg-warning/10 text-warning",
  red: "border-destructive/50 bg-destructive/10 text-destructive",
};
const HEALTH_LABEL: Record<Health, string> = { green: "Normal", orange: "Surveillance", red: "Critique" };

function range(p: PeriodKey) {
  const t = new Date();
  const end = format(t, "yyyy-MM-dd");
  if (p === "day") return { start: end, end };
  if (p === "7d") return { start: format(subDays(t, 6), "yyyy-MM-dd"), end };
  if (p === "30d") return { start: format(subDays(t, 29), "yyyy-MM-dd"), end };
  return { start: format(startOfMonth(t), "yyyy-MM-dd"), end };
}

export function CommandCenter() {
  const { tenantId, tenants } = useTenant() as any;
  const { countries, countryId } = useCountry();
  const [period, setPeriod] = useState<PeriodKey>("day");
  const [countryF, setCountryF] = useState<string>(countries.length > 1 ? "all" : countryId ?? "all");
  const [stationF, setStationF] = useState("all");
  const [productF, setProductF] = useState("all");
  const [drill, setDrill] = useState<{ country?: string; zone?: string; station?: string }>({});

  // Périmètre autorisé : uniquement les pays de l'espace de travail (RLS en plus côté serveur)
  const allowed = useMemo(() => countries.map((c) => c.id), [countries]);
  const scope = useMemo(() => {
    const c = drill.country ?? (countryF !== "all" ? countryF : null);
    return c && allowed.includes(c) ? [c] : allowed;
  }, [countryF, drill.country, allowed]);
  const r = range(period);
  const today = format(new Date(), "yyyy-MM-dd");

  const q = useQuery({
    queryKey: ["command-center", tenantId, scope, r.start, r.end],
    enabled: !!tenantId && scope.length > 0,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const sb = supabase as any;
      const base = (t: string, cols: string) => sb.from(t).select(cols).eq("tenant_id", tenantId).in("country_id", scope);
      const [st, zn, pr, tk, pu, lv, cl, cs, ie, sp, ti] = await Promise.all([
        base("stations", "id,name,location,country_id,zone_id,status"),
        base("perequation_zones", "id,name"),
        base("petroleum_products", "id,name,code,color"),
        base("tanks", "id,name,station_id,product_id,product_type,capacity_liters,status"),
        base("pumps", "id,name,station_id,tank_id,product_id,status"),
        base("stock_levels", "tank_id,station_id,product_id,location_type,theoretical,physical,variance,alert_level,capacity"),
        base("daily_closures", "id,station_id,closure_date,status,total_amount,total_volume").gte("closure_date", r.start).lte("closure_date", r.end).neq("status", "rejected"),
        base("closure_sales", "closure_id,product_id,tank_id,volume,amount"),
        base("index_entries", "station_id,entry_date,total_super_liters,total_gasoil_liters").gte("entry_date", r.start).lte("entry_date", r.end),
        base("supply_requests", "id,reference,station_id,status,qty_requested").in("status", OPEN_SUPPLY),
        base("support_tickets", "id,ticket_number,subject,priority,status,station_id").in("status", OPEN_TICKET),
      ]);
      const err = [st, zn, pr, tk, pu, lv, cl, cs, ie, sp, ti].find((x) => x.error);
      if (err) throw err.error;
      return {
        stations: st.data as any[], zones: zn.data as any[], products: pr.data as any[], tanks: tk.data as any[], pumps: pu.data as any[],
        levels: lv.data as any[], closures: cl.data as any[], closureSales: cs.data as any[], entries: ie.data as any[],
        supplies: sp.data as any[], tickets: ti.data as any[],
      };
    },
  });

  const d = q.data;
  const view = useMemo(() => {
    if (!d) return null;
    const prodById = new Map(d.products.map((p) => [p.id, p]));
    const prodKind = (id?: string | null) => {
      const p: any = id ? prodById.get(id) : null;
      const s = `${p?.code ?? ""} ${p?.name ?? ""}`.toLowerCase();
      return s.includes("gas") || s.includes("diesel") ? "gasoil" : s.includes("sup") || s.includes("ess") ? "super" : null;
    };
    const selKind = productF === "all" ? null : prodKind(productF);
    let stations = d.stations.filter((s) => s.status !== "inactive");
    if (drill.zone) stations = stations.filter((s) => (s.zone_id ?? "none") === drill.zone);
    if (stationF !== "all") stations = stations.filter((s) => s.id === stationF);
    if (drill.station) stations = stations.filter((s) => s.id === drill.station);
    const ids = new Set(stations.map((s) => s.id));

    // Ventes : clôtures (hors rejetées) puis saisies d'index pour les jours sans clôture
    const agg = new Map<string, { amt: number; vol: number; amtToday: number }>();
    const add = (sid: string, date: string, amt: number, vol: number) => {
      if (!ids.has(sid)) return;
      const a = agg.get(sid) ?? { amt: 0, vol: 0, amtToday: 0 };
      a.amt += amt; a.vol += vol; if (date === today) a.amtToday += amt;
      agg.set(sid, a);
    };
    const closureKey = new Set<string>();
    const closureById = new Map(d.closures.map((c) => [c.id, c]));
    const linesByClosure = new Map<string, any[]>();
    d.closureSales.forEach((l) => { if (closureById.has(l.closure_id)) linesByClosure.set(l.closure_id, [...(linesByClosure.get(l.closure_id) ?? []), l]); });
    d.closures.forEach((c) => {
      closureKey.add(`${c.station_id}|${c.closure_date}`);
      if (productF === "all") add(c.station_id, c.closure_date, Number(c.total_amount), Number(c.total_volume));
      else (linesByClosure.get(c.id) ?? []).filter((l) => l.product_id === productF).forEach((l) => add(c.station_id, c.closure_date, Number(l.amount), Number(l.volume)));
    });
    d.entries.forEach((e) => {
      if (closureKey.has(`${e.station_id}|${e.entry_date}`)) return;
      const s = Math.max(0, Number(e.total_super_liters) || 0), g = Math.max(0, Number(e.total_gasoil_liters) || 0);
      const vs = selKind === "gasoil" ? 0 : s, vg = selKind === "super" ? 0 : g;
      if (productF !== "all" && !selKind) return;
      add(e.station_id, e.entry_date, vs * FUEL_PRICES.SUPER + vg * FUEL_PRICES.GASOIL, vs + vg);
    });

    const levels = d.levels.filter((l) => l.location_type === "station" && ids.has(l.station_id) && (productF === "all" || l.product_id === productF));
    const tickets = d.tickets.filter((t) => !t.station_id || ids.has(t.station_id));
    const supplies = d.supplies.filter((s) => ids.has(s.station_id));

    const rows = stations.map((s) => {
      const lv = levels.filter((l) => l.station_id === s.id);
      const tk = tickets.filter((t) => t.station_id === s.id);
      const variance = lv.reduce((a, l) => a + Math.abs(Number(l.variance) || 0), 0);
      const varOut = lv.some((l) => l.variance != null && Math.abs(Number(l.variance)) > Math.max(1, Number(l.theoretical) || 0) * VAR_TOL);
      const reasons: string[] = [];
      let h: Health = "green";
      if (lv.some((l) => l.alert_level === "rupture" || l.alert_level === "critique")) { h = "red"; reasons.push("Stock critique/rupture"); }
      if (tk.some((t) => t.priority === "critical")) { h = "red"; reasons.push("Incident critique"); }
      if (h !== "red") {
        if (lv.some((l) => l.alert_level === "faible")) { h = "orange"; reasons.push("Stock faible"); }
        if (varOut) { h = "orange"; reasons.push("Écart de stock"); }
        if (tk.length) { h = "orange"; reasons.push("Incident ouvert"); }
        if (lv.length === 0) { h = "orange"; reasons.push("Stock non initialisé"); }
      }
      const a = agg.get(s.id) ?? { amt: 0, vol: 0, amtToday: 0 };
      return { ...s, health: h, reasons, stock: lv.reduce((x, l) => x + Math.max(0, Number(l.theoretical) || 0), 0), variance, ...a };
    });

    const sum = (k: "amt" | "vol" | "amtToday" | "stock" | "variance") => rows.reduce((a, x) => a + (x[k] as number), 0);
    const ranked = [...rows].sort((a, b) => b.amt - a.amt);
    return {
      rows, ranked, levels, tickets, supplies,
      kpi: {
        caToday: sum("amtToday"), caPeriod: sum("amt"), volume: sum("vol"), stock: sum("stock"), variance: sum("variance"),
        stations: rows.length, red: rows.filter((x) => x.health === "red").length, orange: rows.filter((x) => x.health === "orange").length,
        alerts: levels.filter((l) => l.alert_level && l.alert_level !== "normal").length,
      },
    };
  }, [d, productF, stationF, drill.zone, drill.station, today]);

  const countryName = (id?: string) => countries.find((c) => c.id === id)?.name ?? "—";
  const zoneName = (id?: string) => (id === "none" ? "Sans zone" : d?.zones.find((z) => z.id === id)?.name ?? "—");
  const tenantName = tenants?.find?.((t: any) => t.id === tenantId)?.name ?? "Groupe";

  if (!allowed.length) return <p className="text-muted-foreground">Aucun pays autorisé pour ce compte.</p>;

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Aujourd'hui</SelectItem><SelectItem value="7d">7 derniers jours</SelectItem>
            <SelectItem value="30d">30 derniers jours</SelectItem><SelectItem value="month">Mois en cours</SelectItem>
          </SelectContent>
        </Select>
        {countries.length > 1 && (
          <Select value={countryF} onValueChange={(v) => { setCountryF(v); setDrill({}); setStationF("all"); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous mes pays</SelectItem>
              {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={stationF} onValueChange={setStationF}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les stations</SelectItem>
            {d?.stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productF} onValueChange={setProductF}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les produits</SelectItem>
            {d?.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{countries.length > 1 ? "" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {q.isFetching && <span className="text-xs text-muted-foreground">Actualisation…</span>}
      </div>

      {/* Fil d'Ariane drill-down */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <Button variant="ghost" size="sm" onClick={() => setDrill({})}>{tenantName}</Button>
        {(drill.country || scope.length === 1) && <><ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Button variant="ghost" size="sm" onClick={() => setDrill({ country: drill.country })}>{countryName(drill.country ?? scope[0])}</Button></>}
        {drill.zone && <><ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Button variant="ghost" size="sm" onClick={() => setDrill({ country: drill.country, zone: drill.zone })}>{zoneName(drill.zone)}</Button></>}
        {drill.station && <><ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="px-3 font-medium">{d?.stations.find((s) => s.id === drill.station)?.name}</span></>}
      </div>

      {q.isLoading || !view ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.error ? (
        <p className="text-destructive">Impossible de charger les indicateurs.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi icon={Banknote} label="CA du jour" value={`${fmt(view.kpi.caToday)} F`} />
            <Kpi icon={TrendingUp} label="CA de la période" value={`${fmt(view.kpi.caPeriod)} F`} />
            <Kpi icon={Fuel} label="Volume vendu" value={`${fmt(view.kpi.volume)} L`} />
            <Kpi icon={Package} label="Stock disponible" value={`${fmt(view.kpi.stock)} L`} />
            <Kpi icon={MapPin} label="Stations" value={fmt(view.kpi.stations)} />
            <Kpi icon={AlertTriangle} label="Critiques / surveillance" value={`${view.kpi.red} / ${view.kpi.orange}`} tone={view.kpi.red ? "red" : view.kpi.orange ? "orange" : undefined} />
            <Kpi icon={Droplets} label="Écarts de stock (abs.)" value={`${fmt(view.kpi.variance)} L`} />
            <Kpi icon={Truck} label="Appro. en cours" value={fmt(view.supplies.length)} />
            <Kpi icon={Activity} label="Alertes stock" value={fmt(view.kpi.alerts)} tone={view.kpi.alerts ? "orange" : undefined} />
            <Kpi icon={LifeBuoy} label="Incidents ouverts" value={fmt(view.tickets.length)} tone={view.tickets.some((t) => t.priority === "critical") ? "red" : undefined} />
          </div>

          {drill.station ? (
            <StationDetail station={view.rows[0]} data={d!} levels={view.levels} productF={productF} />
          ) : (
            <>
              {!drill.country && scope.length > 1 && (
                <Card><CardHeader><CardTitle className="text-base">Pays</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {scope.map((cid) => {
                      const rs = view.rows.filter((x) => x.country_id === cid);
                      return <Group key={cid} title={countryName(cid)} rows={rs} onClick={() => setDrill({ country: cid })} />;
                    })}
                  </CardContent></Card>
              )}
              {(drill.country || scope.length === 1) && !drill.zone && d!.stations.some((s) => s.zone_id) && (
                <Card><CardHeader><CardTitle className="text-base">Zones</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {[...new Set(view.rows.map((x) => x.zone_id ?? "none"))].map((z) => (
                      <Group key={z} title={zoneName(z)} rows={view.rows.filter((x) => (x.zone_id ?? "none") === z)} onClick={() => setDrill({ country: drill.country ?? scope[0], zone: z })} />
                    ))}
                  </CardContent></Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Vue réseau</CardTitle>
                  <div className="flex gap-2 text-xs">{(["green", "orange", "red"] as Health[]).map((h) => <Badge key={h} variant="outline" className={HEALTH_CLS[h]}>{HEALTH_LABEL[h]}</Badge>)}</div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[...view.rows].sort((a, b) => ({ red: 0, orange: 1, green: 2 }[a.health] - { red: 0, orange: 1, green: 2 }[b.health])).map((s) => (
                    <button key={s.id} onClick={() => setDrill({ country: s.country_id, zone: drill.zone, station: s.id })}
                      className={`rounded-lg border p-3 text-left transition hover:scale-[1.02] ${HEALTH_CLS[s.health as Health]}`}>
                      <div className="flex items-center justify-between"><span className="font-semibold text-foreground">{s.name}</span><span className="text-xs">{HEALTH_LABEL[s.health as Health]}</span></div>
                      <div className="mt-1 text-xs text-muted-foreground">{fmt(s.amt)} F · {fmt(s.vol)} L · stock {fmt(s.stock)} L</div>
                      {s.reasons.length > 0 && <div className="mt-1 text-xs">{s.reasons.join(" · ")}</div>}
                    </button>
                  ))}
                  {view.rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune station dans ce périmètre.</p>}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Ranking title="Top stations" icon={TrendingUp} rows={view.ranked.slice(0, 5)} />
                <Ranking title="Bottom stations" icon={TrendingDown} rows={[...view.ranked].reverse().slice(0, 5)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card><CardHeader><CardTitle className="text-base">Approvisionnements en cours</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {view.supplies.slice(0, 8).map((s) => <div key={s.id} className="flex justify-between"><span>{s.reference} · {d!.stations.find((x) => x.id === s.station_id)?.name}</span><Badge variant="outline">{s.status}</Badge></div>)}
                    {!view.supplies.length && <p className="text-muted-foreground">Aucun.</p>}
                  </CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base">Incidents ouverts</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {view.tickets.slice(0, 8).map((t) => <div key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.ticket_number} · {t.subject}</span><Badge variant="outline" className={t.priority === "critical" ? HEALTH_CLS.red : ""}>{t.priority}</Badge></div>)}
                    {!view.tickets.length && <p className="text-muted-foreground">Aucun.</p>}
                  </CardContent></Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: Health }) {
  return (
    <Card className={tone ? HEALTH_CLS[tone] : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <div className="mt-2 font-display text-xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function Group({ title, rows, onClick }: { title: string; rows: any[]; onClick: () => void }) {
  const c = (h: Health) => rows.filter((r) => r.health === h).length;
  return (
    <button onClick={onClick} className="rounded-lg border border-border p-3 text-left hover:bg-muted/40">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{rows.length} stations · {fmt(rows.reduce((a, r) => a + r.amt, 0))} F</div>
      <div className="mt-2 flex gap-1">{(["green", "orange", "red"] as Health[]).map((h) => <Badge key={h} variant="outline" className={HEALTH_CLS[h]}>{c(h)}</Badge>)}</div>
    </button>
  );
}

function Ranking({ title, icon: Icon, rows }: { title: string; icon: any; rows: any[] }) {
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.map((s, i) => <div key={s.id} className="flex justify-between"><span>{i + 1}. {s.name}</span><span className="font-medium">{fmt(s.amt)} F · {fmt(s.vol)} L</span></div>)}
        {!rows.length && <p className="text-muted-foreground">Aucune donnée.</p>}
      </CardContent></Card>
  );
}

function StationDetail({ station, data, levels, productF }: { station: any; data: any; levels: any[]; productF: string }) {
  if (!station) return null;
  const tanks = data.tanks.filter((t: any) => t.station_id === station.id && (productF === "all" || t.product_id === productF));
  const pumps = data.pumps.filter((p: any) => p.station_id === station.id && (productF === "all" || p.product_id === productF));
  const prod = (id: string) => data.products.find((p: any) => p.id === id)?.name ?? "—";
  return (
    <div className="space-y-4">
      <Card className={HEALTH_CLS[station.health as Health]}>
        <CardContent className="p-4">
          <div className="font-display text-lg font-bold text-foreground">{station.name} — {HEALTH_LABEL[station.health as Health]}</div>
          <div className="text-sm text-muted-foreground">{station.location} · {station.reasons.join(" · ") || "Aucune anomalie"}</div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Cuves / produits</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {tanks.map((t: any) => {
            const l = levels.find((x) => x.tank_id === t.id);
            const pct = l && t.capacity_liters ? Math.min(100, (Number(l.theoretical) / t.capacity_liters) * 100) : 0;
            const tone: Health = !l ? "orange" : l.alert_level === "rupture" || l.alert_level === "critique" ? "red" : l.alert_level === "faible" ? "orange" : "green";
            return (
              <div key={t.id} className={`rounded-lg border p-3 ${HEALTH_CLS[tone]}`}>
                <div className="flex justify-between font-semibold text-foreground"><span>{t.name}</span><span className="text-xs">{prod(t.product_id)}</span></div>
                <div className="mt-2 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {l ? `${fmt(Number(l.theoretical))} / ${fmt(t.capacity_liters)} L · écart ${l.variance != null ? fmt(Number(l.variance)) + " L" : "—"}` : "Stock non initialisé"}
                </div>
              </div>
            );
          })}
          {!tanks.length && <p className="text-sm text-muted-foreground">Aucune cuve.</p>}
        </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Pompes</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pumps.map((p: any) => <Badge key={p.id} variant="outline" className={p.status === "active" ? HEALTH_CLS.green : HEALTH_CLS.orange}>{p.name} · {prod(p.product_id)} · {data.tanks.find((t: any) => t.id === p.tank_id)?.name ?? "—"}</Badge>)}
          {!pumps.length && <p className="text-sm text-muted-foreground">Aucune pompe.</p>}
        </CardContent></Card>
    </div>
  );
}
