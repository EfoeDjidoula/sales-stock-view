import { describe, expect, it } from "vitest";
import { autoModel, historicalMeanModel, holdoutMae, holtWintersModel, sarimaModel } from "./forecastModels";

const series = (values: number[]) => values.map((volume, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, volume }));
// Weekly pattern: weekends sell 300 L, weekdays 100 L.
const weekly = series(Array.from({ length: 28 }, (_, i) => (i % 7 >= 5 ? 300 : 100)));

describe("forecast models", () => {
  it("SARIMA reproduces a clean weekly pattern", () => {
    const p = sarimaModel.predict(weekly, 7)!;
    expect(p.path.map(Math.round)).toEqual([100, 100, 100, 100, 100, 300, 300]);
  });
  it("Holt-Winters follows the weekly pattern within 10 L", () => {
    const p = holtWintersModel.predict(weekly, 7)!;
    [100, 100, 100, 100, 100, 300, 300].forEach((v, i) => expect(Math.abs(p.path[i] - v)).toBeLessThan(10));
  });
  it("seasonal models need two weeks of history", () => {
    expect(sarimaModel.predict(weekly.slice(0, 10), 7)).toBeNull();
    expect(holtWintersModel.predict(weekly.slice(0, 10), 7)).toBeNull();
  });
  it("auto picks a seasonal model over the mean when actuals are weekly", () => {
    expect(holdoutMae(sarimaModel, weekly)!).toBeLessThan(holdoutMae(historicalMeanModel, weekly)!);
    expect(autoModel.predict(weekly, 7)!.params.selected).not.toBe("historical-mean-v1");
  });
  it("never forecasts negative sales", () => {
    const falling = series(Array.from({ length: 21 }, (_, i) => Math.max(0, 200 - i * 15)));
    expect(Math.min(...autoModel.predict(falling, 14)!.path)).toBeGreaterThanOrEqual(0);
  });
});
