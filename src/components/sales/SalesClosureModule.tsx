import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { FUEL_PRICES } from "@/config/prices";
import { toast } from "sonner";
import { Loader2, Save, Send, Check, X, RotateCcw, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const CLOSURE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  submitted: { label: "Soumis", variant: "default" },
  validated: { label: "Validé", variant: "outline" },
  rejected: { label: "Rejeté", variant: "destructive" },
};
const ACTION_LABEL: Record<string, string> = { submit: "Soumission", validate: "Validation", reject: "Rejet", reopen: "Réouverture" };
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString("fr-FR");
const isGasoil = (p?: Row) => /gas|ago|diesel/i.test(`${p?.code ?? ""} ${p?.name ?? ""}`);
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? String(e);

interface Line { nozzle: Row; index_start: string; index_end: string; volume: string; volume_mode: "index" | "manual"; unit_price: string }

export const SalesClosureModule = () => {
  const { t, language } = useLanguage();
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canWrite = isPlatformAdmin || can("sales", "create") || can("sales", "edit");
  const canValidate = isPlatformAdmin || can("sales", "validate");
  const canEditPrice = isPlatformAdmin || can("sales", "edit");
  const today = format(new Date(), "yyyy-MM-dd");

  const [stations, setStations] = useState<Row[]>([]);
  const [products, setProducts] = useState<Record<string, Row>>({});
  const [stationId, setStationId] = useState("");
  const [date, setDate] = useState(today);
  const [closure, setClosure] = useState<Row | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [methods, setMethods] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Record<string, { amount: string; reference: string }>>({});
  const [savedSales, setSavedSales] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [levels, setLevels] = useState<Row[]>([]);
  const [tanks, setTanks] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<null | "reject" | "reopen">(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [{ data: st }, { data: pr }, { data: pm }] = await Promise.all([
        scopeQuery(db.from("stations").select("id,name")).order("name"),
        scopeQuery(db.from("petroleum_products").select("id,code,name,color")),
        scopeQuery(db.from("payment_methods").select("*")).order("position"),
      ]);
      setStations(st ?? []);
      setProducts(Object.fromEntries((pr ?? []).map((p: Row) => [p.id, p])));
      setMethods(pm ?? []);
      if (!stationId && st?.length) setStationId(st[0].id);
    })();
  }, [tenantId, countryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = !!closure && !["draft", "rejected"].includes(closure.status);
  const editable = canWrite && !!closure && !locked;

  const load = useCallback(async () => {
    if (!stationId || !date) return;
    setLoading(true);
    try {
      const { data: c } = await db.from("daily_closures").select("*").eq("station_id", stationId).eq("closure_date", date).maybeSingle();
      setClosure(c ?? null);
      const [{ data: nz }, { data: pumps }, { data: tk }, { data: ps }] = await Promise.all([
        db.from("nozzles").select("*").eq("station_id", stationId).eq("status", "active").order("number"),
        db.from("pumps").select("id,name,position").eq("station_id", stationId),
        db.from("tanks").select("id,name,capacity_liters,product_id").eq("station_id", stationId),
        scopeQuery(db.from("price_structures").select("super_price,gasoil_price,effective_date").eq("is_active", true).lte("effective_date", date))
          .order("effective_date", { ascending: false }).limit(1),
      ]);
      const pumpMap = Object.fromEntries((pumps ?? []).map((p: Row) => [p.id, p]));
      setTanks(Object.fromEntries((tk ?? []).map((t: Row) => [t.id, t])));
      const price = ps?.[0];
      const nozzles = (nz ?? []).map((n: Row) => ({ ...n, pump: pumpMap[n.pump_id] }))
        .sort((a: Row, b: Row) => (a.pump?.position ?? 0) - (b.pump?.position ?? 0) || a.number - b.number);
      const ids = nozzles.map((n: Row) => n.id);

      let existing: Row[] = [];
      let prevMap: Record<string, number> = {};
      if (ids.length) {
        const { data: prev } = await db.from("closure_sales").select("nozzle_id,index_end,daily_closures!inner(closure_date)")
          .in("nozzle_id", ids).lt("daily_closures.closure_date", date).not("index_end", "is", null)
          .order("created_at", { ascending: false }).limit(500);
        const sorted = (prev ?? []).sort((a: Row, b: Row) => (b.daily_closures.closure_date as string).localeCompare(a.daily_closures.closure_date));
        for (const r of sorted) if (!(r.nozzle_id in prevMap)) prevMap[r.nozzle_id] = Number(r.index_end);
      }
      if (c) {
        const [{ data: s }, { data: p }, { data: ev }] = await Promise.all([
          db.from("closure_sales").select("*").eq("closure_id", c.id),
          db.from("closure_payments").select("*").eq("closure_id", c.id),
          db.from("closure_events").select("*").eq("closure_id", c.id).order("created_at"),
        ]);
        existing = s ?? [];
        setPayments(Object.fromEntries((p ?? []).map((x: Row) => [x.payment_method_id, { amount: String(x.amount), reference: x.reference ?? "" }])));
        setEvents(ev ?? []);
      } else { setPayments({}); setEvents([]); }
      setSavedSales(existing);
      const exMap = Object.fromEntries(existing.map((r) => [r.nozzle_id, r]));
      setLines(nozzles.map((n: Row) => {
        const e = exMap[n.id];
        const defPrice = isGasoil(products[n.product_id])
          ? (price?.gasoil_price || FUEL_PRICES.GASOIL) : (price?.super_price || FUEL_PRICES.SUPER);
        return {
          nozzle: n,
          index_start: e?.index_start != null ? String(e.index_start) : (n.id in prevMap ? String(prevMap[n.id]) : ""),
          index_end: e?.index_end != null ? String(e.index_end) : "",
          volume: e ? String(e.volume) : "",
          volume_mode: e?.volume_mode ?? "index",
          unit_price: String(e?.unit_price ?? defPrice),
        };
      }));
      const { data: lv } = await db.from("stock_levels").select("*").eq("location_type", "station").eq("station_id", stationId);
      setLevels(lv ?? []);
    } finally { setLoading(false); }
  }, [stationId, date, products, scopeQuery]);

  useEffect(() => { load(); }, [load]);

  const createClosure = async () => {
    setBusy(true);
    const { error } = await db.from("daily_closures").insert({ station_id: stationId, closure_date: date, tenant_id: tenantId, country_id: countryId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Clôture ouverte en brouillon");
    load();
  };

  const lineVolume = (l: Line) => {
    if (l.volume_mode === "manual") return Math.max(0, Number(l.volume) || 0);
    if (l.index_start === "" || l.index_end === "") return 0;
    return Number(l.index_end) - Number(l.index_start);
  };
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const saveSales = async () => {
    if (!closure) return;
    const rows: Row[] = [];
    for (const l of lines) {
      const hasData = l.volume_mode === "manual" ? l.volume !== "" : l.index_end !== "";
      if (!hasData) continue;
      const v = lineVolume(l);
      if ([l.index_start, l.index_end, l.volume, l.unit_price].some((x) => x !== "" && Number(x) < 0)) return toast.error("Valeurs négatives interdites");
      if (l.volume_mode === "index" && (l.index_start === "" || v < 0)) return toast.error(`${l.nozzle.name} : l'index de fin doit être ≥ à l'index de début`);
      rows.push({
        closure_id: closure.id, tenant_id: closure.tenant_id, country_id: closure.country_id, nozzle_id: l.nozzle.id,
        index_start: l.index_start === "" ? null : Number(l.index_start),
        index_end: l.index_end === "" ? null : Number(l.index_end),
        volume: v, volume_mode: l.volume_mode, unit_price: Number(l.unit_price) || 0,
      });
    }
    if (!rows.length) return toast.error("Aucune vente à enregistrer");
    setBusy(true);
    const { error } = await db.from("closure_sales").upsert(rows, { onConflict: "closure_id,nozzle_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ventes enregistrées");
    load();
  };

  const savePayments = async () => {
    if (!closure) return;
    const up: Row[] = []; const del: string[] = [];
    for (const m of methods) {
      const p = payments[m.id];
      const amt = Number(p?.amount) || 0;
      if (amt < 0) return toast.error("Montant négatif interdit");
      if (amt > 0) up.push({ closure_id: closure.id, tenant_id: closure.tenant_id, country_id: closure.country_id, payment_method_id: m.id, amount: amt, reference: p?.reference || null });
      else if (p) del.push(m.id);
    }
    setBusy(true);
    try {
      if (up.length) { const { error } = await db.from("closure_payments").upsert(up, { onConflict: "closure_id,payment_method_id" }); if (error) throw error; }
      if (del.length) { const { error } = await db.from("closure_payments").delete().eq("closure_id", closure.id).in("payment_method_id", del); if (error) throw error; }
      toast.success("Encaissements enregistrés");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const transition = async (action: string, why?: string) => {
    if (!closure) return;
    setBusy(true);
    const { error } = await db.rpc("closure_transition", { _id: closure.id, _action: action, _reason: why ?? null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${ACTION_LABEL[action]} effectuée`);
    setReasonFor(null); setReason("");
    load();
  };

  // Agrégats sur les ventes enregistrées
  const byProduct = useMemo(() => {
    const m: Record<string, { volume: number; amount: number }> = {};
    for (const s of savedSales) {
      const k = s.product_id ?? "—";
      m[k] = m[k] ?? { volume: 0, amount: 0 };
      m[k].volume += Number(s.volume); m[k].amount += Number(s.amount);
    }
    return m;
  }, [savedSales]);
  const byTank = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of savedSales) if (s.tank_id) m[s.tank_id] = (m[s.tank_id] ?? 0) + Number(s.volume);
    return m;
  }, [savedSales]);
  const nozzleName = (id: string) => lines.find((l) => l.nozzle.id === id)?.nozzle;

  const liveTotal = lines.reduce((a, l) => ({ v: a.v + Math.max(0, lineVolume(l)), m: a.m + Math.max(0, lineVolume(l)) * (Number(l.unit_price) || 0) }), { v: 0, m: 0 });
  const payTotal = methods.reduce((a, m) => a + (Number(payments[m.id]?.amount) || 0), 0);

  const status = closure ? CLOSURE_STATUS[closure.status] : null;

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
         <CardHeader><CardTitle>{t("Ventes & clôture journalière")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 items-end">
          <div className="space-y-1">
            <Label>Station</Label>
            <Select value={stationId} onValueChange={setStationId}>
              <SelectTrigger><SelectValue placeholder="Station" /></SelectTrigger>
              <SelectContent>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
             {status ? <Badge variant={status.variant}>{t(status.label)}</Badge> : <span className="text-sm text-muted-foreground">{t("Aucune clôture pour ce jour")}</span>}
             {locked && <Lock className="w-4 h-4 text-muted-foreground" aria-label={t("Verrouillée")} />}
          </div>
          {!closure && canWrite && (
             <Button onClick={createClosure} disabled={busy || !stationId} className="gap-2"><Plus className="w-4 h-4" /> {t("Ouvrir la clôture")}</Button>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <Tabs defaultValue="saisie">
          <TabsList className="flex-wrap h-auto">
             <TabsTrigger value="saisie">{t("Saisie des ventes")}</TabsTrigger>
             <TabsTrigger value="encaissements">{t("Encaissements")}</TabsTrigger>
             <TabsTrigger value="cloture">{t("Clôture du jour")}</TabsTrigger>
             <TabsTrigger value="historique">{t("Historique des clôtures")}</TabsTrigger>
             <TabsTrigger value="modes">{t("Modes de paiement")}</TabsTrigger>
          </TabsList>

          <TabsContent value="saisie" className="mt-4 space-y-3">
             {!lines.length && <p className="text-sm text-muted-foreground">{t("Aucun pistolet actif pour cette station (Configuration → Stations → Référentiels).")}</p>}
            {!!lines.length && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                       <th className="p-2 text-left">{t("Pompe / Pistolet")}</th><th className="p-2 text-left">{t("Produit")}</th>
                       <th className="p-2 text-left">{t("Mode")}</th><th className="p-2 text-left">{t("Index début")}</th><th className="p-2 text-left">{t("Index fin")}</th>
                       <th className="p-2 text-right">Volume (L)</th><th className="p-2 text-left">{t("Prix / L")}</th><th className="p-2 text-right">{t("Montant")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const v = lineVolume(l);
                      const bad = l.volume_mode === "index" && l.index_end !== "" && v < 0;
                      const p = products[l.nozzle.product_id];
                      return (
                        <tr key={l.nozzle.id} className="border-t border-border">
                          <td className="p-2">{l.nozzle.pump?.name ?? "—"} · {l.nozzle.name}</td>
                          <td className="p-2">{p?.name ?? "—"}</td>
                          <td className="p-1 w-28">
                            <Select value={l.volume_mode} disabled={!editable} onValueChange={(val) => setLine(i, { volume_mode: val as Line["volume_mode"] })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                               <SelectContent><SelectItem value="index">Index</SelectItem><SelectItem value="manual">{t("Manuel")}</SelectItem></SelectContent>
                            </Select>
                          </td>
                          <td className="p-1"><Input type="number" min={0} aria-label={`Index début ${l.nozzle.name}`} disabled={!editable || l.volume_mode === "manual"} value={l.index_start} onChange={(e) => setLine(i, { index_start: e.target.value })} /></td>
                          <td className="p-1"><Input type="number" min={0} aria-label={`Index fin ${l.nozzle.name}`} disabled={!editable || l.volume_mode === "manual"} value={l.index_end} className={bad ? "border-destructive" : ""} onChange={(e) => setLine(i, { index_end: e.target.value })} /></td>
                          <td className="p-1 text-right">
                            {l.volume_mode === "manual"
                              ? <Input type="number" min={0} aria-label={`Volume ${l.nozzle.name}`} disabled={!editable} value={l.volume} onChange={(e) => setLine(i, { volume: e.target.value })} />
                              : <span className={bad ? "text-destructive" : ""}>{fmt(v)}</span>}
                          </td>
                          <td className="p-1 w-28"><Input type="number" min={0} aria-label={`Prix ${l.nozzle.name}`} disabled={!editable || !canEditPrice} value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                          <td className="p-2 text-right">{fmt(Math.max(0, v) * (Number(l.unit_price) || 0))}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border font-semibold bg-muted/20">
                       <td className="p-2" colSpan={5}>{t("Total")}</td>
                      <td className="p-2 text-right">{fmt(liveTotal.v)}</td><td /><td className="p-2 text-right">{fmt(liveTotal.m)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
             {editable && <div className="flex justify-end"><Button onClick={saveSales} disabled={busy} className="gap-2"><Save className="w-4 h-4" /> {t("Enregistrer les ventes")}</Button></div>}
            {!closure && <p className="text-sm text-muted-foreground">Ouvrez d'abord la clôture de ce jour pour saisir les ventes.</p>}
          </TabsContent>

          <TabsContent value="encaissements" className="mt-4 space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                 <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">{t("Mode")}</th><th className="p-2 text-left">{t("Montant")}</th><th className="p-2 text-left">{t("Référence")}</th></tr></thead>
                <tbody>
                  {methods.filter((m) => m.is_active || payments[m.id]).map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="p-2">{m.label}</td>
                      <td className="p-1"><Input type="number" min={0} aria-label={`Montant ${m.label}`} disabled={!editable} value={payments[m.id]?.amount ?? ""} onChange={(e) => setPayments((p) => ({ ...p, [m.id]: { amount: e.target.value, reference: p[m.id]?.reference ?? "" } }))} /></td>
                      <td className="p-1"><Input disabled={!editable} value={payments[m.id]?.reference ?? ""} onChange={(e) => setPayments((p) => ({ ...p, [m.id]: { amount: p[m.id]?.amount ?? "", reference: e.target.value } }))} /></td>
                    </tr>
                  ))}
                   <tr className="border-t border-border font-semibold bg-muted/20"><td className="p-2">{t("Total encaissé")}</td><td className="p-2">{fmt(payTotal)}</td><td /></tr>
                </tbody>
              </table>
            </div>
             {editable && <div className="flex justify-end"><Button onClick={savePayments} disabled={busy} className="gap-2"><Save className="w-4 h-4" /> {t("Enregistrer les encaissements")}</Button></div>}
          </TabsContent>

          <TabsContent value="cloture" className="mt-4 space-y-4">
            {!closure ? <p className="text-sm text-muted-foreground">Aucune clôture pour ce jour.</p> : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  {[["Volume total", `${fmt(closure.total_volume)} L`], ["Montant des ventes", fmt(closure.total_amount)], ["Total encaissé", fmt(closure.total_collected)], ["Écart d'encaissement", fmt(closure.cash_variance)]].map(([k, v], i) => (
                    <Card key={k} className="border-border bg-card"><CardContent className="p-4">
                       <p className="text-xs text-muted-foreground">{t(k)}</p>
                      <p className={`text-xl font-bold ${i === 3 && Number(closure.cash_variance) !== 0 ? (Number(closure.cash_variance) < 0 ? "text-destructive" : "text-primary") : ""}`}>{v}</p>
                    </CardContent></Card>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                   <Card className="border-border bg-card"><CardHeader><CardTitle className="text-base">{t("Ventes par produit")}</CardTitle></CardHeader><CardContent>
                    <table className="w-full text-sm"><tbody>
                      {Object.entries(byProduct).map(([pid, v]) => <tr key={pid} className="border-t border-border"><td className="p-2">{products[pid]?.name ?? "—"}</td><td className="p-2 text-right">{fmt(v.volume)} L</td><td className="p-2 text-right">{fmt(v.amount)}</td></tr>)}
                    </tbody></table>
                  </CardContent></Card>
                   <Card className="border-border bg-card"><CardHeader><CardTitle className="text-base">{t("Encaissements par mode")}</CardTitle></CardHeader><CardContent>
                    <table className="w-full text-sm"><tbody>
                      {methods.filter((m) => Number(payments[m.id]?.amount) > 0).map((m) => <tr key={m.id} className="border-t border-border"><td className="p-2">{m.label}</td><td className="p-2 text-right">{fmt(Number(payments[m.id].amount))}</td></tr>)}
                    </tbody></table>
                  </CardContent></Card>
                   <Card className="border-border bg-card"><CardHeader><CardTitle className="text-base">{t("Ventes par pistolet")}</CardTitle></CardHeader><CardContent>
                    <table className="w-full text-sm"><tbody>
                      {savedSales.map((s) => { const n = nozzleName(s.nozzle_id); return <tr key={s.id} className="border-t border-border"><td className="p-2">{n?.pump?.name ?? "—"} · {n?.name ?? "—"}</td><td className="p-2 text-right">{fmt(s.volume)} L</td><td className="p-2 text-right">{fmt(s.amount)}</td></tr>; })}
                    </tbody></table>
                  </CardContent></Card>
                   <Card className="border-border bg-card"><CardHeader><CardTitle className="text-base">{t("Impact sur le stock par cuve")}</CardTitle></CardHeader><CardContent>
                    <table className="w-full text-sm">
                       <thead className="text-muted-foreground"><tr><th className="p-2 text-left">{t("Cuve")}</th><th className="p-2 text-right">{t("Vendu")}</th><th className="p-2 text-right">{t("Stock théorique")}</th><th className="p-2 text-right">{closure.status === "validated" ? "" : t("Après validation")}</th></tr></thead>
                      <tbody>
                        {Object.entries(byTank).map(([tid, vol]) => {
                          const lv = levels.find((x) => x.tank_id === tid);
                          const th = Number(lv?.theoretical ?? 0);
                          const after = th - vol;
                           return <tr key={tid} className="border-t border-border"><td className="p-2">{tanks[tid]?.name ?? "—"}</td><td className="p-2 text-right">{fmt(vol)} L</td><td className="p-2 text-right">{lv ? `${fmt(th)} L` : t("non initialisé")}</td>
                            <td className={`p-2 text-right ${after < 0 && closure.status !== "validated" ? "text-destructive" : ""}`}>{closure.status === "validated" ? "" : `${fmt(after)} L`}</td></tr>;
                        })}
                      </tbody>
                    </table>
                    {closure.status !== "validated" && Object.entries(byTank).some(([tid, vol]) => Number(levels.find((x) => x.tank_id === tid)?.theoretical ?? 0) < vol) && (
                      <p className="text-xs text-destructive mt-2">Stock insuffisant sur au moins une cuve : la validation sera refusée tant que le stock initial ou les entrées ne sont pas saisis.</p>
                    )}
                  </CardContent></Card>
                </div>
                 {closure.last_reason && <p className="text-sm text-muted-foreground">{t("Dernier motif :")} {closure.last_reason}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                   {canWrite && ["draft", "rejected"].includes(closure.status) && <Button onClick={() => transition("submit")} disabled={busy} className="gap-2"><Send className="w-4 h-4" /> {t("Soumettre")}</Button>}
                  {canValidate && closure.status === "submitted" && <>
                     <Button variant="destructive" onClick={() => setReasonFor("reject")} disabled={busy} className="gap-2"><X className="w-4 h-4" /> {t("Rejeter")}</Button>
                     <Button onClick={() => transition("validate")} disabled={busy} className="gap-2"><Check className="w-4 h-4" /> {t("Valider")}</Button>
                  </>}
                   {canValidate && closure.status === "validated" && <Button variant="outline" onClick={() => setReasonFor("reopen")} disabled={busy} className="gap-2"><RotateCcw className="w-4 h-4" /> {t("Rouvrir")}</Button>}
                </div>
                 <Card className="border-border bg-card"><CardHeader><CardTitle className="text-base">{t("Historique de cette clôture")}</CardTitle></CardHeader><CardContent className="space-y-1">
                   {!events.length && <p className="text-sm text-muted-foreground">{t("Aucun changement d'état.")}</p>}
                   {events.map((e) => <p key={e.id} className="text-sm"><span className="text-muted-foreground">{new Date(e.created_at).toLocaleString(language === "en" ? "en-US" : "fr-FR")}</span> · {t(ACTION_LABEL[e.action] ?? e.action)} {language === "en" ? "by" : "par"} {e.author_name ?? "—"} ({t(CLOSURE_STATUS[e.from_status]?.label ?? "")} → {t(CLOSURE_STATUS[e.to_status]?.label ?? "")}){e.reason ? ` — ${e.reason}` : ""}</p>)}
                </CardContent></Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="historique" className="mt-4"><ClosureHistory stations={stations} onOpen={(s, d) => { setStationId(s); setDate(d); }} /></TabsContent>
          <TabsContent value="modes" className="mt-4"><PaymentMethodsTab methods={methods} canEdit={isPlatformAdmin || can("sales", "edit")} onChanged={async () => { const { data } = await scopeQuery(db.from("payment_methods").select("*")).order("position"); setMethods(data ?? []); }} /></TabsContent>
        </Tabs>
      )}

      <Dialog open={!!reasonFor} onOpenChange={(o) => !o && setReasonFor(null)}>
        <DialogContent>
           <DialogHeader><DialogTitle>{t(reasonFor === "reject" ? "Rejeter la clôture" : "Rouvrir la clôture validée")}</DialogTitle></DialogHeader>
          {reasonFor === "reopen" && <p className="text-sm text-muted-foreground">Les ventes déjà sorties du stock seront réintégrées par un ajustement tracé. La clôture repasse en brouillon.</p>}
           <Label>{t("Motif (obligatoire)")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
             <Button variant="outline" onClick={() => setReasonFor(null)}>{t("Annuler")}</Button>
             <Button disabled={!reason.trim() || busy} onClick={() => reasonFor && transition(reasonFor, reason.trim())}>{t("Confirmer")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ClosureHistory = ({ stations, onOpen }: { stations: Row[]; onOpen: (stationId: string, date: string) => void }) => {
  const { t } = useLanguage();
  const { scopeQuery } = useScope();
  const [station, setStation] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(format(new Date(Date.now() - 30 * 864e5), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      let q = scopeQuery(db.from("daily_closures").select("*")).gte("closure_date", from).lte("closure_date", to).order("closure_date", { ascending: false });
      if (station !== "all") q = q.eq("station_id", station);
      if (status !== "all") q = q.eq("status", status);
      const { data } = await q;
      setRows(data ?? []);
    })();
  }, [station, status, from, to, scopeQuery]);
  const name = (id: string) => stations.find((s) => s.id === id)?.name ?? "—";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
         <Select value={station} onValueChange={setStation}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("Toutes les stations")}</SelectItem>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
         <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("Tous les statuts")}</SelectItem>{Object.entries(CLOSURE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{t(v.label)}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
           <thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">{t("Station")}</th><th className="p-2 text-left">{t("Statut")}</th><th className="p-2 text-right">{t("Volume")}</th><th className="p-2 text-right">{t("Montant")}</th><th className="p-2 text-right">{t("Encaissé")}</th><th className="p-2 text-right">{t("Écart")}</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">{r.closure_date}</td><td className="p-2">{name(r.station_id)}</td>
                 <td className="p-2"><Badge variant={CLOSURE_STATUS[r.status]?.variant}>{t(CLOSURE_STATUS[r.status]?.label ?? "")}</Badge></td>
                <td className="p-2 text-right">{fmt(r.total_volume)} L</td><td className="p-2 text-right">{fmt(r.total_amount)}</td><td className="p-2 text-right">{fmt(r.total_collected)}</td>
                <td className={`p-2 text-right ${Number(r.cash_variance) < 0 ? "text-destructive" : ""}`}>{fmt(r.cash_variance)}</td>
                 <td className="p-1"><Button size="sm" variant="ghost" onClick={() => onOpen(r.station_id, r.closure_date)}>{t("Ouvrir")}</Button></td>
              </tr>
            ))}
             {!rows.length && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">{t("Aucune clôture sur cette période.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PaymentMethodsTab = ({ methods, canEdit, onChanged }: { methods: Row[]; canEdit: boolean; onChanged: () => void }) => {
  const { t } = useLanguage();
  const { tenantId, countryId } = useScope();
  const [label, setLabel] = useState("");
  const update = async (id: string, patch: Row) => {
    const { error } = await db.from("payment_methods").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };
  const add = async () => {
    const code = label.trim().toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_");
    const { error } = await db.from("payment_methods").insert({ tenant_id: tenantId, country_id: countryId, code, label: label.trim(), position: methods.length + 1 });
    if (error) return toast.error(error.message);
    setLabel(""); onChanged();
  };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border divide-y divide-border">
        {methods.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-2">
            <Input className="max-w-xs" defaultValue={m.label} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value !== m.label && update(m.id, { label: e.target.value.trim() })} />
             <Badge variant={m.is_active ? "outline" : "secondary"}>{t(m.is_active ? "Actif" : "Inactif")}</Badge>
             {canEdit && <Button size="sm" variant="ghost" onClick={() => update(m.id, { is_active: !m.is_active })}>{t(m.is_active ? "Désactiver" : "Activer")}</Button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2 max-w-md">
           <Input placeholder={t("Nouveau mode de paiement")} value={label} onChange={(e) => setLabel(e.target.value)} />
           <Button onClick={add} disabled={!label.trim()} className="gap-2"><Plus className="w-4 h-4" /> {t("Ajouter")}</Button>
        </div>
      )}
    </div>
  );
};
