import type { MLForecast, MLModel } from "./ml-types";
import type { Risk } from "./types";

// Sensibilidad sobre el pronóstico aprendido, sin atribuir efectos a intervenciones.
export function mlScenario(
  forecast: MLForecast,
  model: MLModel,
  changePP: number,
) {
  if (!Number.isFinite(changePP) || Math.abs(changePP) > 100)
    throw new Error("Cambio fuera de rango");
  const thresholds = model.calibration.risk.thresholds;
  const risk = (value: number): Risk =>
    value < thresholds[0] ? "low" : value < thresholds[1] ? "medium" : "high";
  const clip = (value: number) => Math.max(0, Math.min(1, value));
  const shift = changePP / 100;
  const predicted = clip(forecast.predicted - shift),
    lower = clip(forecast.lower - shift),
    upper = clip(forecast.upper - shift);
  const possible = [
    ...new Set(
      [lower, upper, ...thresholds.filter((t) => lower <= t && t <= upper)].map(
        risk,
      ),
    ),
  ];
  return {
    predicted,
    lower,
    upper,
    risk_level: risk(predicted),
    participation: 1 - predicted,
    classification_uncertain: possible.length > 1,
    applied_change_pp: (forecast.predicted - predicted) * 100,
    clipped:
      predicted !== forecast.predicted - shift ||
      lower !== forecast.lower - shift ||
      upper !== forecast.upper - shift,
  };
}
