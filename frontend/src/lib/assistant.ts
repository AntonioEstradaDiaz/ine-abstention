import type { Indicator, Prediction, Risk } from "./types";

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
  states,
  history,
  thresholds,
  model,
  maePP,
}: {
  prediction: Prediction;
  states: Prediction[];
  history: Indicator[];
  thresholds: number[];
  model: string;
  maePP: number | null;
}): AssistantContext {
  const ranked = [...states].sort((a, b) => b.predicted - a.predicted);
  return {
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
  return [
    `Entidad: ${c.state} (clave ${c.stateCode}).`,
    `Abstención estimada 2027 (elección intermedia): ${pc(c.predicted)}; banda empírica ${pc(c.lower)} – ${pc(c.upper)}.`,
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
    "Responde en español, en 2 a 5 frases claras, usando solo los datos del bloque DATOS. Si algo no está en los datos, dilo.",
    "No inventes cifras, no recomiendes campañas ni intervenciones y no atribuyas causas: las variables son descriptivas.",
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
    return `${c.state} ocupa el lugar ${c.rank} de ${c.total} entidades por abstención estimada para 2027 (${pc(c.predicted)} frente a una media estatal de ${pc(c.meanPredicted)}). En la elección de referencia su brecha frente al dato nacional fue de ${ppText(c.gapVsNational)}. La media estatal da el mismo peso a cada entidad.`;
  if (mentions(q, ["riesgo", "nivel", "semaforo", "por que", "categoria"]))
    return `${c.state} tiene riesgo ${riskName[c.risk]} porque su abstención estimada (${pc(c.predicted)}) cae ${c.risk === "low" ? `por debajo de ${pc(c.thresholds[0])}` : c.risk === "medium" ? `en el tramo medio, desde ${pc(c.thresholds[0])} hasta menos de ${pc(c.thresholds[1])}` : `en o por encima de ${pc(c.thresholds[1])}`}. El modelo ${c.model} repite la abstención de la intermedia de ${c.referenceYear}. El semáforo es relativo y no es un estándar oficial del INE.`;
  return `Para ${c.state} se estima ${pc(c.predicted)} de abstención en la intermedia de 2027 (riesgo ${riskName[c.risk]}, banda ${pc(c.lower)} – ${pc(c.upper)}). La cifra repite la intermedia de ${c.referenceYear}; la media comparable es ${pc(c.historicalMean)}. Pregunta por el riesgo, el histórico, la confiabilidad o la comparación nacional.`;
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
