import { useMemo, useState } from "react";
import { useBiDataset } from "@/lib/metrics/useBiDataset";
import { computeForecasts, shiftDay, autoModel, MODELS } from "@/lib/metrics/forecasting";
import type { Filters } from "@/lib/metrics";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const fmt = (n: number | null, decimals = 0) => n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });

export function ForecastTab(props: { tenantId: string; countryIds: string[]; filters: Filters; today: string }) {
  const { can, isLoading } = usePermissions();
  const { language } = useLanguage();
  if (isLoading) return <Skeleton className="h-64" />;
  if (!can("reports", "view")) return <p className="text-muted-foreground">{language === "en" ? "Access not authorized." : "Accès non autorisé."}</p>;
  return <ForecastContent {...props} />;
}

function ForecastContent({ tenantId, countryIds, filters, today }: { tenantId: string; countryIds: string[]; filters: Filters; today: string }) {
  const { language } = useLanguage();
  const l = (fr: string, en: string) => language === "en" ? en : fr;
  const [historyDays, setHistoryDays] = useState(30);
  const [horizon, setHorizon] = useState(7);
  const [selected, setSelected] = useState("");
  const [modelId, setModelId] = useState("auto");
  const modelNames: Record<string, string> = { auto: l("Auto (meilleur au réalisé)", "Auto (best vs actuals)"), "historical-mean-v1": l("Moyenne historique", "Historical mean"), "holt-winters-v1": l("Lissage exponentiel Holt-Winters", "Holt-Winters exponential smoothing"), "sarima-100-010-7-v1": "SARIMA(1,0,0)(0,1,0)[7]" };
  const model = MODELS.find((m) => m.id === modelId) ?? autoModel;
  const q = useBiDataset(tenantId, countryIds, shiftDay(today, -historyDays - 7), shiftDay(today, -1), true);
  const forecasts = useMemo(() => q.data ? computeForecasts(q.data, { asOf: today, historyDays, horizon, filters, model }) : [], [model, q.data, today, historyDays, horizon, filters.stationId, filters.zoneId, filters.kind]);
  const current = forecasts.find((f) => `${f.stationId}|${f.kind}` === selected) ?? forecasts[0];
  const alerts = forecasts.filter((f) => f.daysToRupture != null && f.daysToRupture <= horizon);
  const confidence = { insufficient: l("Insuffisante", "Insufficient"), low: l("Faible", "Low"), medium: l("Modérée", "Moderate"), high: l("Élevée", "High") };
  const date = (value: string) => new Date(value).toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", { timeZone: "UTC" });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="space-y-1"><h3 className="font-display text-xl font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />{l("Prévisions & alertes", "Forecasts & alerts")}</h3>
        <p className="text-sm text-muted-foreground">{l("Estimations à partir du", "Estimates from")} {date(today)} · {l("sans réception future supposée", "no assumed future receipts")}</p></div>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">{l("Modèle", "Model")}
          <Select value={modelId} onValueChange={setModelId}><SelectTrigger className="w-56" aria-label={l("Modèle de prévision", "Forecast model")}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(modelNames).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-xs text-muted-foreground">{l("Historique", "History")}
          <Select value={String(historyDays)} onValueChange={(v) => setHistoryDays(Number(v))}><SelectTrigger className="w-36" aria-label={l("Historique de prévision", "Forecast history")}><SelectValue /></SelectTrigger><SelectContent>{[7, 14, 30, 90].map((n) => <SelectItem key={n} value={String(n)}>{n} {l("jours", "days")}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1 text-xs text-muted-foreground">{l("Horizon", "Horizon")}
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}><SelectTrigger className="w-36" aria-label={l("Horizon de prévision", "Forecast horizon")}><SelectValue /></SelectTrigger><SelectContent>{[3, 7, 14, 30].map((n) => <SelectItem key={n} value={String(n)}>{n} {l("jours", "days")}</SelectItem>)}</SelectContent></Select></label>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{l("Tous canaux et clients confondus. Les filtres pays, zone, station et produit sont appliqués ; l’historique et l’horizon sont propres à cette vue.", "All channels and clients combined. Country, zone, station and product filters apply; history and horizon are specific to this view.")}</p>
    {q.error ? <div className="space-y-2"><p className="text-destructive">{l("Données indisponibles : prévisions suspendues, aucun zéro supposé.", "Data unavailable: forecasts paused, no assumed zero values.")}</p><Button variant="outline" onClick={() => q.refetch()}>{l("Réessayer", "Retry")}</Button></div> : q.isFetching || !q.data ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div> : <>
      <section className="space-y-2" aria-label={l("Alertes prédictives", "Predictive alerts")}>
        <h4 className="font-semibold">{l("Risques sur l’horizon", "Risks within horizon")} <Badge variant="secondary">{alerts.length}</Badge></h4>
        {alerts.map((f) => <div key={`${f.stationId}|${f.kind}`} className="flex items-start gap-3 border-l-2 border-warning bg-muted/30 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-1" /><div className="min-w-0 text-sm">
            <p>{l("Au rythme actuel,", "At the current rate,")} <strong>{f.stationName}</strong> {l("risque une rupture de", "risks running out of")} {f.kind === "gasoil" ? "Gasoil" : "Super"} {l("dans", "in")} <strong>{fmt(f.daysToRupture, 1)} {l("jours", "days")}</strong>.</p>
            <p className="text-xs text-muted-foreground">{fmt(f.stock)} L ÷ {fmt(f.daily, 1)} L/{l("jour", "day")} · {l("Confiance", "Confidence")} : {confidence[f.confidence]} · {l("hors réceptions futures", "excluding future receipts")}</p>
          </div></div>)}
        {!alerts.length && <p className="text-sm text-muted-foreground">{l("Aucun risque calculable sur cet horizon ; les historiques insuffisants restent indéterminés.", "No calculable risk within this horizon; insufficient histories remain undetermined.")}</p>}
      </section>
      <div className="overflow-x-auto border-y border-border">
        <Table><TableHeader><TableRow>
          <TableHead>Station / {l("Produit", "Product")}</TableHead><TableHead className="text-right">L/{l("jour", "day")}</TableHead><TableHead className="text-right">{l("Consommation prévue", "Expected consumption")} (L)</TableHead><TableHead className="text-right">Stock {l("projeté", "projected")} (L)</TableHead><TableHead>{l("Rupture probable", "Likely stockout")}</TableHead><TableHead className="text-right">{l("Besoin", "Need")} (L)</TableHead><TableHead>{l("Confiance / données", "Confidence / data")}</TableHead>
        </TableRow></TableHeader><TableBody>{forecasts.map((f) => <TableRow key={`${f.stationId}|${f.kind}`}>
          <TableCell><Button variant="link" className="h-auto p-0 text-left whitespace-normal" onClick={() => setSelected(`${f.stationId}|${f.kind}`)}>{f.stationName} · {f.kind === "gasoil" ? "Gasoil" : "Super"}</Button></TableCell>
          <TableCell className="text-right">{fmt(f.daily, 1)}</TableCell><TableCell className="text-right">{fmt(f.consumption)}</TableCell><TableCell className="text-right">{fmt(f.projections.at(-1)?.stock ?? null)}</TableCell><TableCell>{f.ruptureAt ? date(f.ruptureAt) : "—"}</TableCell><TableCell className="text-right">{fmt(f.needLitres)}</TableCell><TableCell><Badge variant={f.confidence === "insufficient" ? "outline" : "secondary"}>{confidence[f.confidence]}</Badge><p className="text-xs text-muted-foreground mt-1">{f.observedDays}/{f.calendarDays} {l("jours observés", "observed days")}</p></TableCell>
        </TableRow>)}{!forecasts.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{l("Aucun historique ou stock autorisé pour cette sélection.", "No authorized history or stock for this selection.")}</TableCell></TableRow>}</TableBody></Table>
      </div>
      {current && <section className="space-y-4">
        <h4 className="font-semibold">{current.stationName} · {current.kind === "gasoil" ? "Gasoil" : "Super"}</h4>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-muted-foreground">{l("Historique utilisé", "History used")}</dt><dd>{date(current.historyStart)} → {date(current.historyEnd)}</dd></div>
          <div><dt className="text-muted-foreground">{l("Dernière observation", "Last observation")}</dt><dd>{current.lastObservation ? date(current.lastObservation) : "—"}</dd></div>
          <div><dt className="text-muted-foreground">{l("Stock actuel", "Current stock")}</dt><dd>{fmt(current.stock)} L</dd></div>
          <div><dt className="text-muted-foreground">{l("Écart absolu moyen (test)", "Mean absolute error (test)")}</dt><dd>{fmt(current.mae, 1)} L/{l("jour", "day")}</dd></div>
        </dl>
        <p className="text-xs text-muted-foreground">{l("Sources : clôtures non rejetées, sinon index non négatifs ; stock théorique du registre. Jours absents exclus, jour en cours exclu. Modèle : " + (modelNames[current.modelId] ?? current.modelId) + ". Paramètres ajustés sur l’historique, modèle Auto choisi par écart au réalisé (7 derniers jours retenus). Confiance qualitative selon volume d’historique, couverture, récence et stabilité ; ce n’est pas une probabilité garantie.", "Sources: non-rejected closures, otherwise nonnegative indexes; theoretical ledger stock. Missing days and current day excluded. Model: " + (modelNames[current.modelId] ?? current.modelId) + ". Parameters fitted on history; Auto picks the model with the lowest error vs the last 7 held-out days. Qualitative confidence based on history size, coverage, recency and stability; not a guaranteed probability.")}</p>
        {Object.keys(current.params).length > 0 && <div className="flex flex-wrap gap-2 text-xs" aria-label={l("Paramètres ajustés", "Fitted parameters")}>{Object.entries(current.params).map(([k, v]) => <Badge key={k} variant="outline">{k.startsWith("mae:") ? `${l("Écart", "MAE")} ${modelNames[k.slice(4)] ?? k.slice(4)}` : k === "selected" ? l("Retenu", "Selected") : k} : {k === "selected" ? modelNames[String(v)] ?? v : v}</Badge>)}</div>}
        <h5 className="text-sm font-medium">{l("Stock projeté en fin de journée", "Projected end-of-day stock")}</h5>
        {current.projections.length ? <div className="h-64 w-full"><ResponsiveContainer><LineChart data={current.projections}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="hsl(var(--muted-foreground))" /><YAxis unit=" L" stroke="hsl(var(--muted-foreground))" /><Tooltip /><Legend />
          <Line dataKey="stock" name={l("Estimation centrale", "Central estimate")} stroke="hsl(var(--primary))" dot={false} /><Line dataKey="stockLow" name={l("Scénario bas", "Low scenario")} stroke="hsl(var(--destructive))" strokeDasharray="4 4" dot={false} /><Line dataKey="stockHigh" name={l("Scénario haut", "High scenario")} stroke="hsl(var(--success))" strokeDasharray="4 4" dot={false} />
        </LineChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">{l("Au moins trois jours observés sont nécessaires au calcul.", "At least three observed days are required.")}</p>}
        <p className="text-xs text-muted-foreground">{l("Scénarios : rythme moyen ± 2 écarts-types historiques, non intervalle probabiliste calibré. Besoin = consommation prévue − stock disponible, minimum zéro ; quantité à valider selon capacités et réceptions attendues.", "Scenarios: mean rate ± 2 historical standard deviations, not a calibrated probability interval. Need = expected consumption − available stock, minimum zero; quantity requires validation against capacities and expected receipts.")}</p>
        <h5 className="text-sm font-medium">{l("Prévision / réalisé — 7 derniers jours complets", "Forecast / actual — last 7 complete days")}</h5>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">{l("Prévision", "Forecast")} (L)</TableHead><TableHead className="text-right">{l("Réalisé", "Actual")} (L)</TableHead><TableHead className="text-right">{l("Écart réalisé − prévision", "Actual − forecast")} (L)</TableHead></TableRow></TableHeader><TableBody>{current.backtest.map((b) => <TableRow key={b.date}><TableCell>{date(b.date)}</TableCell><TableCell className="text-right">{fmt(b.predicted, 1)}</TableCell><TableCell className="text-right">{fmt(b.actual, 1)}</TableCell><TableCell className="text-right">{fmt(b.error, 1)}</TableCell></TableRow>)}{!current.backtest.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{l("Historique antérieur insuffisant pour la comparaison.", "Insufficient prior history for comparison.")}</TableCell></TableRow>}</TableBody></Table></div>
        <p className="text-xs text-muted-foreground">{l("Comparaison rétrospective : modèle ajusté uniquement avant ces sept jours, sans utiliser le réalisé comparé. Les données absentes restent vides. Les estimations ne sont pas des certitudes.", "Retrospective comparison: model fitted only before these seven days, without using the compared actuals. Missing data remains blank. Estimates are not certainties.")}</p>
      </section>}
    </>}
  </div>;
}