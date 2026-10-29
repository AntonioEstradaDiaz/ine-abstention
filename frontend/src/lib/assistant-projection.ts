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
    targetYear > 2029
  )
    throw new Error(
      `Elige un año posterior a ${cutoffYear} y no mayor que 2029. Los años observados se consultan en Histórico.`,
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
  const samples = [...comparable].reverse().map(r => {
    if (!Number.isInteger(r.year) || !Number.isFinite(r.voter_count) || !Number.isFinite(r.nonvoter_count) || r.voter_count < 0 || r.nonvoter_count < 0 || r.voter_count + r.nonvoter_count <= 0)
      throw new Error("Conteos históricos inválidos para calcular la banda.");
    return { year: r.year, rate: r.nonvoter_count / (r.voter_count + r.nonvoter_count) };
  });
  if (new Set(samples.map(r => r.year)).size !== samples.length)
    throw new Error("Hay años duplicados en el histórico.");
  const errors = samples.slice(1).map((r, i) => Math.abs(r.rate - samples[i].rate));
  const radius = errors.length ? Math.max(...errors) : null;
  const match =
    registered &&
    registered.prediction.state_code === stateCode &&
    registered.forecast.target_year === targetYear &&
    registered.forecast.election_type === electionType &&
    registered.forecast.as_of_year === cutoffYear &&
    registered.prediction.explanation.reference_year === reference.year &&
    registered.prediction.explanation.voter_count === voters &&
    registered.prediction.explanation.nonvoter_count === nonvoters;
  const abstention = match
    ? registered.prediction.predicted
    : nonvoters / (voters + nonvoters);
  if (!Number.isFinite(abstention) || abstention < 0 || abstention > 1)
    throw new Error("La estimación registrada no contiene una tasa válida.");
  const lower = match ? registered.prediction.lower : radius == null ? null : Math.max(0, abstention - radius);
  const upper = match ? registered.prediction.upper : radius == null ? null : Math.min(1, abstention + radius);
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
      : "baseline_last: NV / (SV + NV) de la última elección del mismo tipo",
    warning: match
      ? "Estimación experimental; la banda empírica no garantiza cobertura futura."
      : `Referencia constante basada en la última elección comparable. ${radius == null ? "Histórico insuficiente para calcular un rango." : `Rango de sensibilidad: máximo error de ${errors.length} comparaciones históricas del mismo tipo (${(radius * 100).toFixed(2)} pp).`} No es un intervalo de confianza ni garantiza cobertura futura. El año elegido representa un escenario, no confirma una elección.`,
  };
}
