import type { Forecast, Prediction, Risk } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export type ComparedState = {
  state_code: string;
  name: string;
  baseline: number;
  scenario: number;
  lower: number;
  upper: number;
  riskBefore: Risk;
  riskAfter: Risk;
  appliedPP: number;
  clipped: boolean;
};

export function compareStateScenarios(
  states: Prediction[],
  codes: string[],
  changePP: number,
  forecast: Forecast,
): ComparedState[] {
  if (!Number.isFinite(changePP) || Math.abs(changePP) > 100)
    throw new Error("Supuesto fuera de rango");
  if (codes.length < 2 || codes.length > 6 || new Set(codes).size !== codes.length)
    throw new Error("Selecciona de dos a seis estados distintos");
  const thresholds = forecast.calibration.risk.thresholds;
  if (thresholds.length !== 2 || !thresholds.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
      thresholds[0] > thresholds[1])
    throw new Error("Umbrales del modelo no disponibles");
  const classify = (n: number): Risk =>
    n < thresholds[0] ? "low" : n < thresholds[1] ? "medium" : "high";
  const lookup = new Map(states.map((state) => [state.state_code, state]));
  return codes.map((code) => {
    const state = lookup.get(code);
    if (!state) throw new Error("Entidad sin pronóstico: " + code);
    const shift = changePP / 100;
    const raw = state.predicted - shift;
    const low = state.lower - shift;
    const high = state.upper - shift;
    const point = clamp(raw);
    return {
      state_code: code,
      name: state.name,
      baseline: state.predicted,
      scenario: point,
      lower: clamp(low),
      upper: clamp(high),
      riskBefore: state.risk_level,
      riskAfter: classify(point),
      appliedPP: (state.predicted - point) * 100,
      clipped: raw !== point || low !== clamp(low) || high !== clamp(high),
    };
  });
}

export function comparisonCsv(rows: ComparedState[], forecast: Forecast): string {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const data: unknown[][] = [
    ["Estado", "Codigo", "Año", "Corrida", "Abstención base",
      "Abstención escenario", "Banda inferior", "Banda superior", "Cambio aplicado pp",
      "Riesgo base", "Riesgo escenario", "Recorte"],
    ...rows.map((row) => [
      row.name, row.state_code, forecast.target_year, forecast.id, row.baseline,
      row.scenario, row.lower, row.upper, row.appliedPP,
      row.riskBefore, row.riskAfter, row.clipped,
    ]),
  ];
  return "\uFEFF" + data.map((values) => values.map(escape).join(",")).join("\r\n");
}
