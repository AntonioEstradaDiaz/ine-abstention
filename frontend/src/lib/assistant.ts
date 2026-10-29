import type { AssistantProjection } from "./assistant-projection";
import type { Forecast, Indicator, Prediction, Risk } from "./types";

// Shared by the browser fallback and the Ollama route: one source of facts.
export type AssistantRole = "user" | "assistant";
export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}
export interface AssistantStatus {
  provider?: "gemini" | "ollama" | "groq";
  reachable: boolean;
  models: string[];
  defaultModel: string | null;
}
export interface AssistantReply {
  answer: string;
  model: string;
}
export interface AssistantContext {
  forecast: Forecast;
  prediction: Prediction;
  observedHistory: Indicator[];
  projection?: AssistantProjection;
  state: string;
  stateCode: string;
  predicted: number;
  lower: number;
  upper: number;
  risk: Risk;
  possibleRisks: Risk[];
  referenceYear: number;
  voters: number;
  nonvoters: number;
  historicalMean: number;
  trendPerYear: number;
  gapVsNational: number;
  rank: number;
  total: number;
  meanPredicted: number;
  thresholds: number[];
  model: string;
  maePP: number | null;
  history: Array<{
    year: number;
    type: string;
    participation: number | null;
    abstention: number | null;
    unspecified: number | null;
  }>;
}

export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_LENGTH = 1_500;
const riskName: Record<Risk, string> = {
  low: "bajo",
  medium: "medio",
  high: "alto",
};
const title = (s: string) =>
  s
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const pc = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "s/d" : `${(v * 100).toFixed(1)}%`;
const ppText = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)} pp`;

export function buildAssistantContext({
  prediction: p,
  forecast,
  states,
  history,
  thresholds,
  model,
  maePP,
}: {
  prediction: Prediction;
  forecast: Forecast;
  states: Prediction[];
  history: Indicator[];
  thresholds: number[];
  model: string;
  maePP: number | null;
}): AssistantContext {
  const ranked = [...states].sort((a, b) => b.predicted - a.predicted);
  return {
    forecast,
    prediction: p,
    observedHistory: history,
    state: title(p.name),
    stateCode: p.state_code,
    predicted: p.predicted,
    lower: p.lower,
    upper: p.upper,
    risk: p.risk_level,
    possibleRisks: p.uncertainty.risk_levels_possible,
    referenceYear: p.explanation.reference_year,
    voters: p.explanation.voter_count,
    nonvoters: p.explanation.nonvoter_count,
    historicalMean: p.explanation.context_only.historical_mean_abstention,
    trendPerYear: p.explanation.context_only.abstention_trend_pp_per_year,
    gapVsNational: p.explanation.context_only.previous_gap_vs_national_pp,
    rank: ranked.findIndex((s) => s.state_code === p.state_code) + 1,
    total: states.length,
    meanPredicted: states.length
      ? states.reduce((sum, s) => sum + s.predicted, 0) / states.length
      : p.predicted,
    thresholds,
    model,
    maePP,
    history: [...history]
      .sort((a, b) => a.year - b.year)
      .map((r) => ({
        year: r.year,
        type: r.election_type === "midterm" ? "intermedia" : "presidencial",
        participation: r.participation_rate,
        abstention: r.abstention_rate,
        unspecified: r.unspecified_rate,
      })),
  };
}

// Facts block for the LLM: numbers come from INE data and the trained model only.
export function contextFacts(c: AssistantContext) {
  if (c.projection?.kind === "reference") {
    const p = c.projection;
    return `Entidad: ${c.state}. Año solicitado: ${p.targetYear}. Tipo de referencia: ${p.electionType}. Corte observado: ${p.cutoffYear}.
Proyección hipotética de abstención: ${pc(p.abstention)}; participación: ${pc(p.participation)}.
Método: ${p.method}. Elección de referencia: ${p.referenceYear}; fuente INE CCPC ${p.sourceId}.
Rango de abstención: ${pc(p.lower)} a ${pc(p.upper)}. ${p.warning}
No trasladar el riesgo, ranking, errores ni banda del pronóstico ${c.forecast.target_year} a este horizonte.
Histórico: ${JSON.stringify(c.history)}`;
  }
  return [
    `Entidad: ${c.state} (clave ${c.stateCode}).`,
    `Abstención estimada ${c.forecast.target_year} (${c.forecast.election_type === "midterm" ? "intermedia" : "presidencial"}): ${pc(c.predicted)}; banda empírica ${pc(c.lower)} – ${pc(c.upper)}.`,
    `Nivel de riesgo relativo: ${riskName[c.risk]}. Niveles posibles dentro de la banda: ${c.possibleRisks.map((r) => riskName[r]).join(", ")}.`,
    `Umbrales del semáforo: bajo < ${pc(c.thresholds[0])}; medio < ${pc(c.thresholds[1])}; alto desde ${pc(c.thresholds[1])}. No es un estándar oficial del INE.`,
    `Modelo: ${c.model}. Repite la abstención de la última elección del mismo tipo (${c.referenceYear}): ${c.nonvoters.toLocaleString("es-MX")} no votantes de ${(c.voters + c.nonvoters).toLocaleString("es-MX")} personas con participación conocida.`,
    c.maePP == null
      ? "Error de prueba 2024: no disponible."
      : `Error absoluto medio en la prueba temporal 2024: ${c.maePP.toFixed(2)} pp (32 estados).`,
    `Media histórica de abstención comparable: ${pc(c.historicalMean)}. Tendencia descriptiva: ${ppText(c.trendPerYear)} por año. Brecha previa vs. nacional: ${ppText(c.gapVsNational)}.`,
    `Posición: ${c.rank} de ${c.total} entidades por abstención estimada; media estatal ${pc(c.meanPredicted)}.`,
    "Histórico observado (INE, CCPC; tasas sobre SV + NV, NS aparte):",
    ...c.history.map(
      (h) =>
        `- ${h.year} ${h.type}: participación ${pc(h.participation)}, abstención ${pc(h.abstention)}, sin especificar ${pc(h.unspecified)}.`,
    ),
  ].join("\n");
}

export function systemPrompt(c: AssistantContext) {
  return [
    "Eres el asistente analítico de Pulso electoral, un prototipo que explora la abstención electoral en México con datos abiertos del INE.",
    "Responde en español con una conclusión, el año y método, los límites y, si se solicita, pasos generales verificables. Usa solo las cifras del bloque DATOS. Si algo no está en los datos, dilo. El horizonte activo es el elegido en el selector; si se pide otro, indica que debe cambiarlo. No inventes un pronóstico nuevo en el texto.",
    "No inventes cifras ni atribuyas causas: las variables son descriptivas. No recomiendes campañas, mensajes, segmentación ni intervenciones para aumentar o reducir la participación electoral de estados o grupos específicos. Puedes proponer mejoras generales de calidad de datos, accesibilidad del dashboard y evaluación del modelo, con responsable sugerido, plazo orientativo y criterio verificable; no prometas efectos sobre los votos.",
    "Recuerda que la estimación es experimental y que la banda no garantiza cobertura.",
    "",
    "DATOS",
    contextFacts(c),
  ].join("\n");
}

const mentions = (q: string, words: string[]) =>
  words.some((w) => q.includes(w));

// Deterministic reading used when Ollama is unavailable; labelled as such in the UI.
export function automaticAnswer(question: string, c: AssistantContext) {
  const q = question
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const activeYear = c.projection?.targetYear ?? c.forecast.target_year;
  const requestedYears = q.match(/\b20\d{2}\b/g);
  if (
    requestedYears?.some(
      (y) =>
        Number(y) > Math.max(...c.history.map((h) => h.year)) &&
        Number(y) !== activeYear,
    )
  )
    return `El horizonte seleccionado es ${activeYear}. Cambia el año en el selector y pulsa Calcular proyección para consultar otro; no trasladaré las cifras actuales a un año distinto.`;
  if (
    mentions(q, [
      "solucion",
      "recomienda",
      "mejora",
      "propon",
      "acciones",
      "plan",
      "propuesta",
    ])
  )
    return "Puedo proponer mejoras generales del análisis, no estrategias para modificar la participación electoral de estados o grupos específicos. Plan orientativo: 1) Equipo de datos: revisar duplicados, conteos y registros NS en una semana; criterio: informe de calidad sin inconsistencias pendientes. 2) Equipo de modelado: evaluar con cortes temporales separados y elecciones del mismo tipo en dos semanas; criterio: errores y límites reproducibles publicados. 3) Equipo de producto: revisar teclado, contraste y lenguaje del dashboard en una semana; criterio: incidencias corregidas y verificadas. Los plazos requieren confirmar capacidad y no prometen cambios en votos.";
  if (c.projection?.kind === "reference") {
    const p = c.projection;
    return `Proyección experimental para ${c.state}, ${p.targetYear}: abstención ${pc(p.abstention)} y participación ${pc(p.participation)}. Referencia ${p.electionType === "midterm" ? "intermedia" : "presidencial"} de ${p.referenceYear}, fuente INE CCPC ${p.sourceId}. Método: ${p.method}. Corte ${p.cutoffYear}. Rango de abstención: ${pc(p.lower)} a ${pc(p.upper)}. ${p.warning}`;
  }
  const observed = c.history.filter((h) => h.abstention != null);
  const first = observed[0];
  const last = observed.at(-1);
  if (mentions(q, ["confi", "error", "banda", "incert", "precis"]))
    return `La estimación para ${c.state} es ${pc(c.predicted)}, con una banda empírica de ${pc(c.lower)} a ${pc(c.upper)}. ${c.maePP == null ? "El error de prueba no está disponible." : `En la prueba temporal 2024 el modelo falló en promedio ${c.maePP.toFixed(2)} pp por estado.`} ${c.possibleRisks.length > 1 ? `Dentro de la banda el riesgo podría ser ${c.possibleRisks.map((r) => riskName[r]).join(", ")}, así que la categoría es incierta.` : "La categoría se mantiene estable dentro de la banda."} La banda no garantiza cobertura futura.`;
  if (mentions(q, ["histor", "tendencia", "evolu", "pasad", "anterior"]))
    return first && last
      ? `Entre ${first.year} y ${last.year} la abstención observada en ${c.state} pasó de ${pc(first.abstention)} a ${pc(last.abstention)}. La media comparable de elecciones intermedias es ${pc(c.historicalMean)} y la tendencia descriptiva es ${ppText(c.trendPerYear)} por año. Estas cifras describen el territorio; no explican causas.`
      : `No hay histórico observado suficiente para ${c.state}.`;
  if (
    mentions(q, ["nacion", "compar", "promedio", "otros", "ranking", "posic"])
  )
    return `${c.state} ocupa el lugar ${c.rank} de ${c.total} entidades por abstención estimada para ${activeYear} (${pc(c.predicted)} frente a una media estatal de ${pc(c.meanPredicted)}). En la elección de referencia su brecha frente al dato nacional fue de ${ppText(c.gapVsNational)}. La media estatal da el mismo peso a cada entidad.`;
  if (mentions(q, ["riesgo", "nivel", "semaforo", "por que", "categoria"]))
    return `${c.state} tiene riesgo ${riskName[c.risk]} porque su abstención estimada (${pc(c.predicted)}) cae ${c.risk === "low" ? `por debajo de ${pc(c.thresholds[0])}` : c.risk === "medium" ? `en el tramo medio, desde ${pc(c.thresholds[0])} hasta menos de ${pc(c.thresholds[1])}` : `en o por encima de ${pc(c.thresholds[1])}`}. El modelo ${c.model} repite la abstención de la intermedia de ${c.referenceYear}. El semáforo es relativo y no es un estándar oficial del INE.`;
  return `Para ${c.state} se estima ${pc(c.predicted)} de abstención en ${activeYear} (riesgo ${riskName[c.risk]}, banda ${pc(c.lower)} – ${pc(c.upper)}). La cifra repite la intermedia de ${c.referenceYear}; la media comparable es ${pc(c.historicalMean)}. Pregunta por el riesgo, el histórico, la confiabilidad o la comparación nacional.`;
}

export function validMessages(value: unknown): AssistantMessage[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_MESSAGES)
    return null;
  const messages: AssistantMessage[] = [];
  for (const m of value) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      !m.content.trim() ||
      m.content.length > MAX_MESSAGE_LENGTH
    )
      return null;
    messages.push({ role: m.role, content: m.content.trim() });
  }
  return messages.at(-1)!.role === "user" ? messages : null;
}
