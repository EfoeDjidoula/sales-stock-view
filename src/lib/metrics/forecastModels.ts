/** Replaceable forecast models: historical mean, Holt-Winters (weekly), light SARIMA(1,0,0)(0,1,0)[7], and auto-selection by holdout MAE. */
import { mean, sampleStandardDeviation } from "simple-statistics";

export type Observation = { date: string; volume: number };
export type Prediction = { daily: number; low: number; high: number; path: number[]; params: Record<string, number | string> };
export type ForecastModel = { id: string; predict: (history: Observation[], horizon: number) => Prediction | null };

const SEASON = 7;
const sd = (v: number[]) => (v.length > 1 ? sampleStandardDeviation(v) : 0);
const pack = (path: number[], residualSd: number, params: Prediction["params"]): Prediction => {
  const clean = path.map((x) => Math.max(0, x));
  const daily = mean(clean);
  return { daily, low: Math.max(0, daily - 2 * residualSd), high: daily + 2 * residualSd, path: clean, params };
};

/** Empirical dispersion band, not a calibrated probability interval. */
export const historicalMeanModel: ForecastModel = {
  id: "historical-mean-v1",
  predict(history, horizon) {
    if (history.length < 3) return null;
    const values = history.map((x) => x.volume);
    const m = mean(values);
    return pack(Array(horizon).fill(m), sd(values), {});
  },
};

function holtWinters(y: number[], a: number, b: number, g: number, horizon: number) {
  let level = mean(y.slice(0, SEASON));
  let trend = (mean(y.slice(SEASON, 2 * SEASON)) - level) / SEASON;
  const season = y.slice(0, SEASON).map((v) => v - level);
  const residuals: number[] = [];
  for (let t = SEASON; t < y.length; t++) {
    const s = season[t % SEASON];
    residuals.push(y[t] - (level + trend + s));
    const prev = level;
    level = a * (y[t] - s) + (1 - a) * (level + trend);
    trend = b * (level - prev) + (1 - b) * trend;
    season[t % SEASON] = g * (y[t] - level) + (1 - g) * s;
  }
  const path = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend + season[(y.length + h) % SEASON]);
  return { path, residuals };
}

/** Additive Holt-Winters; α, β, γ tuned by grid search on one-step-ahead MAE. */
export const holtWintersModel: ForecastModel = {
  id: "holt-winters-v1",
  predict(history, horizon) {
    const y = history.map((x) => x.volume);
    if (y.length < 2 * SEASON) return null;
    const grid = [0.1, 0.3, 0.5, 0.8];
    let best: { mae: number; a: number; b: number; g: number; r: ReturnType<typeof holtWinters> } | null = null;
    for (const a of grid) for (const b of [0.01, 0.1, 0.3]) for (const g of grid) {
      const r = holtWinters(y, a, b, g, horizon);
      const mae = mean(r.residuals.map(Math.abs));
      if (!best || mae < best.mae) best = { mae, a, b, g, r };
    }
    return pack(best!.r.path, sd(best!.r.residuals), { alpha: best!.a, beta: best!.b, gamma: best!.g });
  },
};

/** SARIMA(1,0,0)(0,1,0)[7]: weekly differencing then AR(1) estimated by least squares. */
export const sarimaModel: ForecastModel = {
  id: "sarima-100-010-7-v1",
  predict(history, horizon) {
    const y = history.map((x) => x.volume);
    if (y.length < 2 * SEASON + 2) return null;
    const d = y.slice(SEASON).map((v, i) => v - y[i]);
    let num = 0, den = 0;
    for (let t = 1; t < d.length; t++) { num += d[t] * d[t - 1]; den += d[t - 1] ** 2; }
    const phi = den > 0 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;
    const residuals = d.slice(1).map((v, i) => v - phi * d[i]);
    const series = [...y];
    let last = d.at(-1)!;
    for (let h = 0; h < horizon; h++) { last = phi * last; series.push(series[series.length - SEASON] + last); }
    return pack(series.slice(y.length), sd(residuals), { phi: Number(phi.toFixed(3)), order: "(1,0,0)(0,1,0)[7]" });
  },
};

export const MODELS = [historicalMeanModel, holtWintersModel, sarimaModel];

/** Holdout MAE of a model: fit on all but the last `k` observations, compare to them. */
export function holdoutMae(model: ForecastModel, history: Observation[], k = SEASON): number | null {
  if (history.length <= k) return null;
  const p = model.predict(history.slice(0, -k), k);
  if (!p) return null;
  return mean(history.slice(-k).map((o, i) => Math.abs(o.volume - p.path[i])));
}

/** Picks, per series, the model with the lowest holdout MAE against observed actuals. */
export const autoModel: ForecastModel = {
  id: "auto",
  predict(history, horizon) {
    const scored = MODELS.map((m) => ({ m, mae: holdoutMae(m, history) })).filter((s) => s.mae != null) as { m: ForecastModel; mae: number }[];
    const chosen = scored.sort((a, b) => a.mae - b.mae)[0]?.m ?? historicalMeanModel;
    const p = chosen.predict(history, horizon);
    if (!p) return null;
    const scores = Object.fromEntries(scored.map((s) => [`mae:${s.m.id}`, Number(s.mae.toFixed(1))]));
    return { ...p, params: { ...p.params, ...scores, selected: chosen.id } };
  },
};
