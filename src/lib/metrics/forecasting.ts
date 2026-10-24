/** Read-only, replaceable forecast models; missing observations are never zero sales. */
import { mean } from "simple-statistics";
import { buildSaleFacts, daysBetween, productKind, type Dataset, type Filters, type Kind } from "./index";
import { autoModel, historicalMeanModel, type ForecastModel, type Observation } from "./forecastModels";
export { autoModel, historicalMeanModel, holtWintersModel, sarimaModel, MODELS } from "./forecastModels";
export type { ForecastModel, Observation } from "./forecastModels";

export const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export type Projection = { date: string; sales: number; low: number; high: number; stock: number | null; stockLow: number | null; stockHigh: number | null };
export type Backtest = { date: string; predicted: number; actual: number | null; error: number | null };
export type Forecast = {
  stationId: string; stationName: string; countryId: string; kind: Kind; modelId: string;
  historyStart: string; historyEnd: string; observedDays: number; calendarDays: number; lastObservation: string | null;
  confidence: "insufficient" | "low" | "medium" | "high";
  daily: number | null; stock: number | null; capacity: number; horizon: number;
  consumption: number | null; needLitres: number | null; daysToRupture: number | null; ruptureAt: string | null;
  projections: Projection[]; backtest: Backtest[]; mae: number | null;
};

function observations(d: Dataset, stationId: string, kind: Kind, start: string, end: string): Observation[] {
  const volumes = new Map<string, number>();
  buildSaleFacts(d, { start, end }).filter((f) => f.stationId === stationId && f.kind === kind)
    .forEach((f) => volumes.set(f.date, (volumes.get(f.date) ?? 0) + Math.max(0, f.volume)));
  const closures = d.closures.filter((c) => c.station_id === stationId && c.status !== "rejected" && c.closure_date >= start && c.closure_date <= end);
  const closed = new Set(closures.map((c) => c.closure_date));
  const products = new Map(d.products.map((p) => [p.id, productKind(p)]));
  const dates = new Set(closures.filter((c) => d.closureSales.some((s) => s.closure_id === c.id && products.get(s.product_id ?? "") === kind && Number.isFinite(s.volume) && s.volume >= 0)).map((c) => c.closure_date));
  d.entries.filter((e) => e.station_id === stationId && e.entry_date >= start && e.entry_date <= end).forEach((e) => {
    const v = kind === "super" ? e.total_super_liters : e.total_gasoil_liters;
    if (!closed.has(e.entry_date) && v != null && Number.isFinite(v) && v >= 0) dates.add(e.entry_date);
  });
  return [...dates].sort().map((date) => ({ date, volume: volumes.get(date) ?? 0 }));
}

export function computeForecasts(d: Dataset, options: {
  asOf: string; historyDays: number; horizon: number; filters?: Pick<Filters, "stationId" | "zoneId" | "kind">; model?: ForecastModel;
}): Forecast[] {
  const { asOf, filters = {}, model = historicalMeanModel } = options;
  const historyDays = Math.max(7, Math.min(90, Math.floor(options.historyDays)));
  const horizon = Math.max(1, Math.min(30, Math.floor(options.horizon)));
  const historyEnd = shiftDay(asOf, -1), historyStart = shiftDay(asOf, -historyDays);
  const products = new Map(d.products.map((p) => [p.id, productKind(p)]));
  return d.stations.filter((s) => s.status !== "inactive" && (!filters.stationId || s.id === filters.stationId) && (!filters.zoneId || (s.zone_id ?? "none") === filters.zoneId)).flatMap((station) => {
    const kinds = new Set<Kind>();
    d.levels.filter((l) => l.station_id === station.id).forEach((l) => { const k = products.get(l.product_id ?? ""); if (k && k !== "other") kinds.add(k); });
    buildSaleFacts(d, { start: historyStart, end: historyEnd }).filter((f) => f.stationId === station.id && f.kind !== "other").forEach((f) => kinds.add(f.kind));
    return [...kinds].filter((k) => !filters.kind || k === filters.kind).map((kind): Forecast => {
      const history = observations(d, station.id, kind, historyStart, historyEnd);
      const prediction = model.predict(history);
      const levels = d.levels.filter((l) => l.station_id === station.id && products.get(l.product_id ?? "") === kind);
      const stock = levels.length && levels.every((l) => l.theoretical != null && Number.isFinite(l.theoretical)) ? levels.reduce((sum, l) => sum + Math.max(0, l.theoretical ?? 0), 0) : null;
      const capacity = levels.reduce((sum, l) => sum + Math.max(0, l.capacity ?? 0), 0);
      const lastObservation = history.at(-1)?.date ?? null;
      const recent = lastObservation != null && daysBetween(lastObservation, historyEnd) <= 3;
      const coverage = history.length / historyDays;
      const stability = prediction && prediction.daily > 0 ? (prediction.high - prediction.daily) / (2 * prediction.daily) : Infinity;
      const confidence = !prediction ? "insufficient" : history.length >= 21 && coverage >= 0.8 && stability <= 0.5 && recent ? "high" : history.length >= 7 && coverage >= 0.5 && recent ? "medium" : "low";
      const consumption = prediction ? prediction.daily * horizon : null;
      const daysToRupture = stock != null && prediction ? stock === 0 ? 0 : prediction.daily > 0 ? stock / prediction.daily : null : null;
      const ruptureAt = daysToRupture != null && daysToRupture <= 365 ? new Date(Date.parse(`${asOf}T00:00:00Z`) + daysToRupture * 86400000).toISOString() : null;
      const projections = prediction ? Array.from({ length: horizon }, (_, i) => ({
        date: shiftDay(asOf, i), sales: prediction.daily, low: prediction.low, high: prediction.high,
        stock: stock == null ? null : Math.max(0, stock - prediction.daily * (i + 1)),
        stockLow: stock == null ? null : Math.max(0, stock - prediction.high * (i + 1)),
        stockHigh: stock == null ? null : Math.max(0, stock - prediction.low * (i + 1)),
      })) : [];
      // Holdout: each forecast is fitted ONLY to dates before the comparison period.
      const cutoff = shiftDay(asOf, -7);
      const training = observations(d, station.id, kind, shiftDay(cutoff, -historyDays), shiftDay(cutoff, -1));
      const baseline = model.predict(training);
      const actuals = new Map(history.map((o) => [o.date, o.volume]));
      const backtest = baseline ? Array.from({ length: 7 }, (_, i) => {
        const date = shiftDay(cutoff, i), actual = actuals.get(date) ?? null;
        return { date, predicted: baseline.daily, actual, error: actual == null ? null : actual - baseline.daily };
      }) : [];
      const errors = backtest.flatMap((b) => b.error == null ? [] : [Math.abs(b.error)]);
      return { stationId: station.id, stationName: station.name, countryId: station.country_id, kind, modelId: model.id,
        historyStart, historyEnd, observedDays: history.length, calendarDays: historyDays, lastObservation, confidence,
        daily: prediction?.daily ?? null, stock, capacity, horizon, consumption,
        needLitres: stock != null && consumption != null ? Math.max(0, consumption - stock) : null,
        daysToRupture, ruptureAt, projections, backtest, mae: errors.length ? mean(errors) : null };
    });
  });
}