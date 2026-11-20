import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { AlertTriangle, CheckCircle2, Download, Loader2, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useBranding } from "@/hooks/useBranding";
import { useDayPrices } from "@/hooks/useIndexDailyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays } from "@/lib/reports";
import {
  FUELS, dailyRows, financialBalance, fuelOf, missingDays, pumpSummaries, stockBalance,
  type EntryRow, type Fuel, type PumpRow, type ReceptionRow, type StockBalance, type TankReadingRow, type Verdict,
} from "@/lib/managerAccount";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TOL_KEY = "lumatek.managerAccount.tolerance";
const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtL = (v: number | null | undefined) => fmt(v, 2);
const dateFr = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR");
const FUEL_LABEL: Record<Fuel, string> = { super: "Super", gasoil: "Gasoil" };
const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  ok: { label: "Dans la tolérance", cls: "bg-success/15 text-success border-success/30" },
  manquant: { label: "Manquant à justifier", cls: "bg-destructive/15 text-negative border-destructive/30" },
  excedent: { label: "Excédent à justifier", cls: "bg-warning/15 text-warning border-warning/30" },
  na: { label: "Non qualifiable", cls: "bg-muted text-muted-foreground border-border" },
};

/** Lecture paginée (plafond 1 000 lignes par requête). */
async function fetchAll<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const all: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

const BALANCE_ROWS: { key: keyof StockBalance; label: string; strong?: boolean; hint?: string }[] = [
  { key: "stockInitial", label: "Stock initial (jauge d'ouverture)" },
  { key: "receptions", label: "+ Réceptions en cuve", hint: "Réceptions logistiques validées" },
  { key: "totalDisponible", label: "= Total disponible", strong: true },
  { key: "ventes", label: "− Ventes (sorties nettes pistolets)" },
  { key: "stockTheorique", label: "= Stock théorique", strong: true },
  { key: "stockPhysique", label: "Stock physique final (jauge)" },
  { key: "ecart", label: "Écart (physique − théorique)", strong: true },
];

export default function ManagerAccount() {
  const { tenantId, countryId, scopeQuery } = useScope();
  const brand = useBranding();
  const [stationId, setStationId] = useState<string>("");
  const [from, setFrom] = useState(yesterday.slice(0, 8) + "01");
  const [to, setTo] = useState(yesterday);
  const [includePending, setIncludePending] = useState(false);
  const [tolerance, setTolerance] = useState<string>(() => localStorage.getItem(TOL_KEY) ?? "0,30");
  useEffect(() => { localStorage.setItem(TOL_KEY, tolerance); }, [tolerance]);
  const tol = Math.abs(parseFloat(tolerance.replace(",", "."))) || 0;
  const rangeOk = !!from && !!to && from <= to;

  const { data: stations = [] } = useQuery({
    queryKey: ["synthesis-stations", tenantId, countryId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await scopeQuery(db.from("stations").select("id,name")).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  useEffect(() => { if (!stationId && stations.length) setStationId(stations[0].id); }, [stations, stationId]);
  const station = stations.find((s) => s.id === stationId);

  const { data: prices } = useDayPrices(rangeOk ? to : undefined);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["manager-account", tenantId, countryId, stationId, from, to, includePending],
    enabled: !!tenantId && !!stationId && rangeOk,
    queryFn: async () => {
      const statuses = includePending ? ["valide", "pre_enregistre"] : ["valide"];
      const entries = await fetchAll<EntryRow & { id: string }>((a, b) =>
        scopeQuery(db.from("index_entries").select("id,entry_date,status,vente_globale,autoconso_montant,bons_clients_montant,tickets_valeur_montant,cartes_montant,versement_momo,montant_a_verser,versement_banque,ecart_versement"))
          .eq("station_id", stationId).gte("entry_date", from).lte("entry_date", to).in("status", statuses)
          .order("entry_date").range(a, b));
      const ids = new Set(entries.map((e) => e.id));
      const [pumpsRaw, readingsRaw, recRaw, products, pumpNames] = await Promise.all([
        fetchAll<PumpRow & { entry_id: string }>((a, b) =>
          scopeQuery(db.from("pump_index_entries").select("entry_id,entry_date,pump_id,product_type,index_depart,index_arrivee,retour_cuve"))
            .eq("station_id", stationId).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<TankReadingRow & { entry_id: string }>((a, b) =>
          scopeQuery(db.from("index_tank_readings").select("entry_id,entry_date,tank_id,product_type,stock_ouverture,depotage,sortie,jauge,ecart"))
            .eq("station_id", stationId).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Record<string, unknown>>((a, b) =>
          scopeQuery(db.from("supply_requests").select("reference,bl_number,product_id,qty_approved,qty_loaded,qty_delivered,qty_received,received_at"))
            .eq("station_id", stationId).eq("status", "received")
            .gte("received_at", from).lt("received_at", addDays(to, 1)).order("received_at").range(a, b)),
        scopeQuery(db.from("petroleum_products").select("id,code,name")).then((r: { data: unknown[] | null }) => (r.data ?? []) as { id: string; code: string; name: string }[]),
        scopeQuery(db.from("pumps").select("id,name,position")).eq("station_id", stationId).then((r: { data: unknown[] | null }) => (r.data ?? []) as { id: string; name: string; position: number | null }[]),
      ]);
      const prodFuel = new Map<string, Fuel | "other">((products as { id: string; code: string; name: string }[]).map((p) => [p.id, fuelOf(`${p.code} ${p.name}`)]));
      const receptions: ReceptionRow[] = recRaw.map((r) => ({
        date: String(r.received_at).slice(0, 10),
        fuel: prodFuel.get(String(r.product_id)) ?? "other",
        reference: r.reference as string, bl_number: r.bl_number as string,
        qty_approved: r.qty_approved as number, qty_loaded: r.qty_loaded as number,
        qty_delivered: r.qty_delivered as number, qty_received: r.qty_received as number,
      }));
      return {
        entries,
        pumps: pumpsRaw.filter((p) => ids.has(p.entry_id)),
        readings: readingsRaw.filter((r) => ids.has(r.entry_id)),
        receptions,
        pumpNames: new Map((pumpNames as { id: string; name: string; position: number | null }[]).map((p) => [p.id, p])),
      };
    },
  });

  const result = useMemo(() => {
    if (!data) return null;
    const balances = Object.fromEntries(FUELS.map((f) => [f, stockBalance(f, data.readings, data.pumps, data.receptions, tol)])) as Record<Fuel, StockBalance>;
    const pumps = pumpSummaries(data.pumps).sort((a, b) => {
      const pa = data.pumpNames.get(a.pump_id), pb = data.pumpNames.get(b.pump_id);
      return a.fuel.localeCompare(b.fuel) * -1 || (pa?.position ?? 0) - (pb?.position ?? 0) || (pa?.name ?? "").localeCompare(pb?.name ?? "");
    });
    return {
      balances, pumps,
      days: dailyRows(data.entries, data.readings, data.pumps),
      finance: financialBalance(data.entries),
      missing: missingDays(from, to, data.entries),
    };
  }, [data, tol, from, to]);

  const price = (f: Fuel) => (prices ? prices[f] : 0);
  const pumpName = (id: string) => data?.pumpNames.get(id)?.name ?? "Pompe";

  const exportXlsx = async () => {
    if (!result || !data) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Compte des gérants");
    const title = ws.addRow([`COMPTE DES GÉRANTS — ${station?.name ?? ""}`]); title.font = { bold: true, size: 14 };
    ws.addRow([brand.companyName, `Du ${dateFr(from)} au ${dateFr(to)}`, includePending ? "Saisies validées + en attente" : "Saisies validées N+1", `Tolérance ±${fmt(tol, 2)} %`]);
    ws.addRow([]);
    ws.addRow(["A. BILAN MATIÈRES (litres)", "Super", "Gasoil"]).font = { bold: true };
    BALANCE_ROWS.forEach((r) => ws.addRow([r.label, result.balances.super[r.key] as number, result.balances.gasoil[r.key] as number]));
    ws.addRow(["Écart % des ventes", result.balances.super.ecartPct, result.balances.gasoil.ecartPct]);
    ws.addRow(["Qualification", VERDICT[result.balances.super.verdict].label, VERDICT[result.balances.gasoil.verdict].label]);
    ws.addRow(["Valorisation de l'écart (FCFA)", result.balances.super.ecart * price("super"), result.balances.gasoil.ecart * price("gasoil")]);
    ws.addRow([]);
    ws.addRow(["B. LIVRAISONS", "Date", "Produit", "Réf.", "BL", "Commandé", "Enlevé (facturé)", "Réceptionné", "Écart transport"]).font = { bold: true };
    data.receptions.forEach((r) => ws.addRow(["", dateFr(r.date), r.fuel === "other" ? "Autre" : FUEL_LABEL[r.fuel], r.reference ?? "", r.bl_number ?? "", r.qty_approved, r.qty_loaded, r.qty_received, (Number(r.qty_received) || 0) - (Number(r.qty_loaded) || 0)]));
    ws.addRow([]);
    ws.addRow(["C. INDEX COMPTEURS", "Produit", "Index début", "Index fin", "Brut", "Retour cuve", "Sortie nette"]).font = { bold: true };
    result.pumps.forEach((p) => ws.addRow([pumpName(p.pump_id), p.fuel === "other" ? "Autre" : FUEL_LABEL[p.fuel], p.indexDebut, p.indexFin, p.brut, p.retour, p.net]));
    ws.addRow([]);
    ws.addRow(["D. BILAN FINANCIER (FCFA)", "Montant"]).font = { bold: true };
    const f = result.finance;
    ([["Vente globale", f.venteGlobale], ["Autoconsommation", f.autoconso], ["Bons clients", f.bonsClients], ["Tickets valeur", f.tickets], ["Cartes", f.cartes], ["Mobile Money", f.momo], ["Montant à verser", f.montantAVerser], ["Versement banque", f.versementBanque], ["Écart de versement", f.ecartVersement]] as [string, number][]).forEach((r) => ws.addRow(r));
    ws.addRow([]);
    ws.addRow(["E. DÉTAIL JOURNALIER", "Statut", "Ventes Super", "Ventes Gasoil", "Dépotage Super", "Dépotage Gasoil", "Jauge Super", "Jauge Gasoil", "Écart Super", "Écart Gasoil"]).font = { bold: true };
    result.days.forEach((d) => ws.addRow([dateFr(d.date), d.status === "valide" ? "Validé N+1" : "En attente", d.ventes.super, d.ventes.gasoil, d.depotages.super, d.depotages.gasoil, d.jauge.super, d.jauge.gasoil, d.ecart.super, d.ecart.gasoil]));
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 38 : 16; c.numFmt = "#,##0.00"; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()]));
    a.download = `Compte_des_gerants_${(station?.name ?? "station").replace(/\s+/g, "_")}_${from}_au_${to}.xlsx`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(9rem,1fr))_auto] items-end">
            <div className="space-y-1.5">
              <Label>Station</Label>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger><SelectValue placeholder="Choisir une station" /></SelectTrigger>
                <SelectContent>{stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-from">Date de début</Label>
              <Input id="ma-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-to">Date de fin</Label>
              <Input id="ma-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ma-tol">Tolérance coulage (± % des ventes)</Label>
              <Input id="ma-tol" inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </div>
            <Button variant="outline" className="gap-2" disabled={!result} onClick={() => void exportXlsx()}>
              <Download className="w-4 h-4" /> Excel
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={includePending} onCheckedChange={setIncludePending} />
              Inclure les saisies en attente de validation N+1
            </label>
            {prices && <span>Prix de valorisation au {dateFr(to)} : Super {fmt(prices.super)} · Gasoil {fmt(prices.gasoil)} FCFA/L ({prices.source})</span>}
            {isFetching && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          {!rangeOk && <p className="mt-3 text-sm text-negative">La date de début doit précéder la date de fin.</p>}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-negative">Données indisponibles : {(error as Error).message}</p>}

      {isLoading || !result ? (
        rangeOk && stationId ? <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div> : null
      ) : (
        <>
          {result.missing.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
              <span>
                {result.missing.length} jour(s) sans saisie {includePending ? "retenue" : "validée N+1"} sur la période
                {result.missing.length <= 8 ? ` : ${result.missing.map(dateFr).join(", ")}` : ""}. Le bilan ne couvre que les jours saisis.
              </span>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Scale className="w-4 h-4 text-primary" /> A. Bilan matières (litres)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="min-w-[520px]">
                  <TableHeader><TableRow><TableHead>Poste</TableHead>{FUELS.map((f) => <TableHead key={f} className="text-right">{FUEL_LABEL[f]}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {BALANCE_ROWS.map((r) => (
                      <TableRow key={r.key} className={r.strong ? "bg-muted/30 font-semibold" : ""}>
                        <TableCell>{r.label}{r.hint && <span className="block text-xs font-normal text-muted-foreground">{r.hint}</span>}</TableCell>
                        {FUELS.map((f) => {
                          const v = result.balances[f][r.key] as number;
                          return <TableCell key={f} className={`text-right tabular-nums ${r.key === "ecart" ? (v < 0 ? "text-negative" : v > 0 ? "text-warning" : "") : ""}`}>{fmtL(v)}</TableCell>;
                        })}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>Écart en % des ventes</TableCell>
                      {FUELS.map((f) => { const p = result.balances[f].ecartPct; return <TableCell key={f} className="text-right tabular-nums">{p == null ? "—" : `${p > 0 ? "+" : ""}${fmt(p, 3)} %`}</TableCell>; })}
                    </TableRow>
                    <TableRow>
                      <TableCell>Qualification (± {fmt(tol, 2)} %)</TableCell>
                      {FUELS.map((f) => { const v = VERDICT[result.balances[f].verdict]; return <TableCell key={f} className="text-right"><Badge variant="outline" className={`whitespace-nowrap ${v.cls}`}>{v.label}</Badge></TableCell>; })}
                    </TableRow>
                    <TableRow>
                      <TableCell>Valorisation de l'écart (FCFA)</TableCell>
                      {FUELS.map((f) => <TableCell key={f} className="text-right tabular-nums">{fmt(result.balances[f].ecart * price(f))}</TableCell>)}
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="mt-3 text-xs text-muted-foreground">
                  Contrôle croisé — dépotages déclarés dans les saisies : Super {fmtL(result.balances.super.depotagesSaisis)} L · Gasoil {fmtL(result.balances.gasoil.depotagesSaisis)} L.
                </p>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Bilan financier (FCFA)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {([
                      ["Vente globale (index × prix du jour)", result.finance.venteGlobale, true],
                      ["− Autoconsommation", result.finance.autoconso],
                      ["− Bons clients", result.finance.bonsClients],
                      ["− Tickets valeur", result.finance.tickets],
                      ["− Cartes carburant", result.finance.cartes],
                      ["− Mobile Money", result.finance.momo],
                      ["= Montant à verser", result.finance.montantAVerser, true],
                      ["Versement banque déclaré", result.finance.versementBanque],
                    ] as [string, number, boolean?][]).map(([l, v, strong]) => (
                      <TableRow key={l} className={strong ? "bg-muted/30 font-semibold" : ""}><TableCell>{l}</TableCell><TableCell className="text-right tabular-nums">{fmt(v)}</TableCell></TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell>Écart de versement</TableCell>
                      <TableCell className={`text-right tabular-nums ${result.finance.ecartVersement < -0.5 ? "text-negative" : "text-success"}`}>{fmt(result.finance.ecartVersement)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">B. Livraisons de la période — commandé, enlevé (facturé) et réceptionné</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {data!.receptions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réception validée sur la période.</p> : (
                <Table className="min-w-[760px]">
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Produit</TableHead><TableHead>Référence</TableHead><TableHead>BL</TableHead><TableHead className="text-right">Commandé</TableHead><TableHead className="text-right">Enlevé (facturé)</TableHead><TableHead className="text-right">Réceptionné</TableHead><TableHead className="text-right">Écart transport</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data!.receptions.map((r, i) => {
                      const gap = (Number(r.qty_received) || 0) - (Number(r.qty_loaded) || 0);
                      return (
                        <TableRow key={i}>
                          <TableCell>{dateFr(r.date)}</TableCell><TableCell>{r.fuel === "other" ? "Autre" : FUEL_LABEL[r.fuel]}</TableCell>
                          <TableCell className="text-xs">{r.reference}</TableCell><TableCell>{r.bl_number}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.qty_approved)}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.qty_loaded)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(r.qty_received)}</TableCell>
                          <TableCell className={`text-right tabular-nums ${gap < 0 ? "text-negative" : ""}`}>{fmt(gap)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {FUELS.map((f) => { const b = result.balances[f]; return (
                      <TableRow key={f} className="bg-muted/30 font-semibold">
                        <TableCell colSpan={4}>Total {FUEL_LABEL[f]}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.commande)}</TableCell><TableCell className="text-right tabular-nums">{fmt(b.enleve)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.receptions)}</TableCell><TableCell className="text-right tabular-nums">{fmt(b.ecartTransport)}</TableCell>
                      </TableRow>
                    ); })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">C. Index compteurs — du {dateFr(from)} au {dateFr(to)}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader><TableRow><TableHead>Pompe</TableHead><TableHead>Produit</TableHead><TableHead className="text-right">Index début</TableHead><TableHead className="text-right">Index fin</TableHead><TableHead className="text-right">Brut</TableHead><TableHead className="text-right">Retour cuve</TableHead><TableHead className="text-right">Sortie nette</TableHead></TableRow></TableHeader>
                <TableBody>
                  {result.pumps.map((p) => (
                    <TableRow key={p.pump_id}>
                      <TableCell className="font-medium">{pumpName(p.pump_id)}</TableCell><TableCell>{p.fuel === "other" ? "Autre" : FUEL_LABEL[p.fuel]}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(p.indexDebut)}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.indexFin)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtL(p.brut)}</TableCell><TableCell className="text-right tabular-nums">{fmtL(p.retour)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtL(p.net)}</TableCell>
                    </TableRow>
                  ))}
                  {result.pumps.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Aucun index sur la période.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">D. Détail journalier des stocks (litres)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Statut</TableHead>
                  {FUELS.map((f) => <TableHead key={`v${f}`} className="text-right">Ventes {FUEL_LABEL[f]}</TableHead>)}
                  {FUELS.map((f) => <TableHead key={`d${f}`} className="text-right">Dépotage {FUEL_LABEL[f]}</TableHead>)}
                  {FUELS.map((f) => <TableHead key={`j${f}`} className="text-right">Jauge {FUEL_LABEL[f]}</TableHead>)}
                  {FUELS.map((f) => <TableHead key={`e${f}`} className="text-right">Écart {FUEL_LABEL[f]}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {result.days.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{dateFr(d.date)}</TableCell>
                      <TableCell>{d.status === "valide" ? <span className="inline-flex items-center gap-1 text-success text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Validé N+1</span> : <span className="text-warning text-xs">En attente</span>}</TableCell>
                      {FUELS.map((f) => <TableCell key={`v${f}`} className="text-right tabular-nums">{fmtL(d.ventes[f])}</TableCell>)}
                      {FUELS.map((f) => <TableCell key={`d${f}`} className="text-right tabular-nums">{d.depotages[f] ? fmtL(d.depotages[f]) : "—"}</TableCell>)}
                      {FUELS.map((f) => <TableCell key={`j${f}`} className="text-right tabular-nums">{fmtL(d.jauge[f])}</TableCell>)}
                      {FUELS.map((f) => <TableCell key={`e${f}`} className={`text-right tabular-nums ${d.ecart[f] < 0 ? "text-negative" : ""}`}>{fmtL(d.ecart[f])}</TableCell>)}
                    </TableRow>
                  ))}
                  {result.days.length === 0 && <TableRow><TableCell colSpan={10} className="text-muted-foreground">Aucune saisie retenue sur la période.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
