import type { ElectionType, Forecast, Indicator, Prediction } from "./types";

export interface AssistantProjection {
  targetYear: number;
  electionType: ElectionType;
  cutoffYear: number;
  referenceYear: number;
  sourceId: number;
  abstention: number;
  participation: number;
  lower: number | null;
  upper: number | null;
  kind: "registered" | "reference";
  forecastId: string | null;
  method: string;
  warning: string;
}

export function projectHorizon(
  history: Indicator[],
  stateCode: string,
  targetYear: number,
  electionType: ElectionType,
  registered?: { forecast: Forecast; prediction: Prediction },
): AssistantProjection {
  const rows = history.filter(
    (r) => (r.state_code || r.official_code) === stateCode,
  );
  if (!rows.length)
    throw new Error("No hay datos históricos para esta entidad.");
  const cutoffYear = Math.max(...rows.map((r) => r.year));
  if (
    !Number.isInteger(targetYear) ||
    targetYear <= cutoffYear ||
    targetYear > 2100
  )
    throw new Error(
      `Elige un año posterior a ${cutoffYear} y no mayor que 2100. Los años observados se consultan en Histórico.`,
    );
  if (electionType !== "midterm" && electionType !== "presidential")
    throw new Error("Selecciona un tipo de elección válido.");
  const comparable = rows
    .filter((r) => r.election_type === electionType)
    .sort((a, b) => b.year - a.year);
  const reference = comparable[0];
  if (!reference)
    throw new Error(
      "No hay una elección del mismo tipo para calcular esta referencia.",
    );
  if (comparable.filter((r) => r.year === reference.year).length !== 1)
    throw new Error(
      "Hay registros duplicados en la elección de referencia; revisa los datos.",
    );
  const { voter_count: voters, nonvoter_count: nonvoters } = reference;
  if (
    !Number.isFinite(voters) ||
    !Number.isFinite(nonvoters) ||
    voters < 0 ||
    nonvoters < 0 ||
    voters + nonvoters <= 0
  )
    throw new Error(
      "Los conteos de la elección de referencia no permiten calcular una tasa.",
    );
  const match =
    registered &&
    registered.prediction.state_code === stateCode &&
    registered.forecast.target_year === targetYear &&
    registered.forecast.election_type === electionType &&
    registered.forecast.as_of_year === cutoffYear;
  const samples = [...comparable].reverse().map(r => {
    const total = r.voter_count + r.nonvoter_count;
    if (!Number.isFinite(total) || r.voter_count < 0 || r.nonvoter_count < 0 || total <= 0)
      throw new Error("Conteos históricos inválidos para entrenar la tendencia.");
    return { x: r.year, y: r.nonvoter_count / total };
  });
  if (new Set(samples.map(r => r.x)).size !== samples.length)
    throw new Error("Hay años duplicados en el histórico comparable.");
  // Rolling-origin evaluation: every held-out election uses only earlier data.
  const predict = (train: typeof samples, year: number) => {
    const mx = train.reduce((s, r) => s + r.x, 0) / train.length;
    const my = train.reduce((s, r) => s + r.y, 0) / train.length;
    const slope = train.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0) /
      train.reduce((s, r) => s + (r.x - mx) ** 2, 0);
    return Math.max(0, Math.min(1, my + slope * (year - mx)));
  };
  let trendError = 0, baselineError = 0;
  for (let i = 2; i < samples.length; i++) {
    trendError += Math.abs(predict(samples.slice(0, i), samples[i].x) - samples[i].y);
    baselineError += Math.abs(samples[i - 1].y - samples[i].y);
  }
  const useTrend = samples.length >= 3 && trendError < baselineError;
  const fitted = useTrend ? predict(samples, targetYear) : nonvoters / (voters + nonvoters);
  const evaluation = samples.length >= 3
    ? `Validación temporal: ${samples.length - 2} elecciones; error absoluto medio de tendencia ${(100 * trendError / (samples.length - 2)).toFixed(2)} pp y referencia ${(100 * baselineError / (samples.length - 2)).toFixed(2)} pp.`
    : "Histórico insuficiente para validar tendencia; se conserva la última tasa comparable.";
  const abstention = match
    ? registered.prediction.predicted
    : fitted;
  if (!Number.isFinite(abstention) || abstention < 0 || abstention > 1)
    throw new Error("La estimación registrada no contiene una tasa válida.");
  const lower = match ? registered.prediction.lower : null;
  const upper = match ? registered.prediction.upper : null;
  if (
    match &&
    (lower == null ||
      upper == null ||
      !Number.isFinite(lower) ||
      !Number.isFinite(upper) ||
      lower < 0 ||
      lower > abstention ||
      upper < abstention ||
      upper > 1)
  )
    throw new Error("La banda registrada no es válida.");
  return {
    targetYear,
    electionType,
    cutoffYear,
    referenceYear: match
      ? registered.prediction.explanation.reference_year
      : reference.year,
    sourceId: match
      ? registered.prediction.explanation.source_id
      : reference.source_id,
    abstention,
    participation: 1 - abstention,
    lower,
    upper,
    kind: match ? "registered" : "reference",
    forecastId: match ? registered.forecast.id : null,
    method: match
      ? registered.forecast.provenance.model_name
      : ` ${useTrend ? "Regresión lineal temporal ajustada a conteos NV / (SV + NV) del mismo tipo" : "baseline_last: última tasa comparable"}. ${evaluation}`,
    warning: match
      ? "Estimación experimental; la banda empírica no garantiza cobertura futura."
      : "Escenario experimental condicionado al tipo de elección, no un resultado observado. No hay banda calibrada para este horizonte. La validación histórica limitada no garantiza precisión futura. Elegir un año no confirma que exista una elección en él; la extrapolación pierde fiabilidad con la distancia.",
  };
}
