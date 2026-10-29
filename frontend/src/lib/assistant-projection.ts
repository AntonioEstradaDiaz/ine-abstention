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
    registered.forecast.as_of_year >= cutoffYear;
  const abstention = match
    ? registered.prediction.predicted
    : nonvoters / (voters + nonvoters);
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
      : "baseline_last: NV / (SV + NV) de la última elección del mismo tipo",
    warning: match
      ? "Estimación experimental; la banda empírica no garantiza cobertura futura."
      : "Proyección hipotética de referencia constante, no un modelo entrenado para este horizonte. No incorpora tendencias ni cambios futuros; no hay banda calibrada ni precisión validada para este año. Elegir un año no confirma que exista una elección en él. El supuesto se debilita a mayor distancia del último dato.",
  };
}
