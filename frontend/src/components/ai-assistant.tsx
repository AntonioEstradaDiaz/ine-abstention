"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Cpu,
  Database,
  MapPin,
  SendHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  automaticAnswer,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES,
  type AssistantContext,
  type AssistantMessage,
  type AssistantReply,
  type AssistantStatus,
} from "@/lib/assistant";
import { projectHorizon } from "@/lib/assistant-projection";
import type { ElectionType } from "@/lib/types";
import { DashboardSelect } from "./ui/dashboard-select";

const suggestions = [
  "¿Cuál es la proyección del año seleccionado?",
  "Propón mejoras generales para evaluar los datos y el modelo",
  "¿Por qué tiene este nivel de riesgo?",
  "Resume su histórico de abstención",
  "¿Qué tan confiable es la estimación?",
  "¿Cómo se compara con el resto del país?",
];
type ChatEntry = AssistantMessage & {
  source?: "ollama" | "auto";
  model?: string;
};

async function assistantStatus(signal: AbortSignal) {
  const response = await fetch("/api/assistant", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Estado del asistente no disponible");
  return (await response.json()) as AssistantStatus;
}
async function ask(body: {
  state_code: string;
  target_year: number;
  election_type: ElectionType;
  model: string;
  messages: AssistantMessage[];
}) {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "El asistente no respondió.",
    );
  return data as AssistantReply;
}

export function AiAssistant({
  context: baseContext,
}: {
  context: AssistantContext | null;
}) {
  const [yearInput, setYearInput] = useState<string | null>(null);
  const [targetYear, setTargetYear] = useState<number | null>(null);
  const [electionType, setElectionType] = useState<ElectionType | null>(null);
  const horizon = useMemo(() => {
    if (!baseContext) return { context: null, error: null };
    try {
      const projection = projectHorizon(
        baseContext.observedHistory,
        baseContext.stateCode,
        targetYear ?? baseContext.forecast.target_year,
        electionType ?? baseContext.forecast.election_type,
        { forecast: baseContext.forecast, prediction: baseContext.prediction },
      );
      return { context: { ...baseContext, projection }, error: null };
    } catch (error) {
      return {
        context: null,
        error:
          error instanceof Error ? error.message : "Proyección no disponible.",
      };
    }
  }, [baseContext, targetYear, electionType]);
  const context = horizon.context;
  const projection = context?.projection;
  const cutoff = baseContext
    ? Math.max(...baseContext.observedHistory.map((h) => h.year))
    : 2024;

  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: ({ signal }) => assistantStatus(signal),
    retry: false,
    staleTime: 30_000,
  });
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const models = status.data?.models ?? [];
  const model =
    chosenModel && models.includes(chosenModel)
      ? chosenModel
      : (status.data?.defaultModel ?? null);
  const online = !!status.data?.reachable && !!model;
  const code = JSON.stringify(context);
  const activeCode = useRef(code);
  activeCode.current = code;
  useEffect(() => {
    activeCode.current = code;
    setChat([]);
    setNotice(null);
  }, [code]);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.length]);
  const mutation = useMutation({ mutationFn: ask });
  const send = (text: string) => {
    const question = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!question || !context || mutation.isPending) return;
    const next: ChatEntry[] = [...chat, { role: "user", content: question }];
    setChat(next);
    setDraft("");
    const fallback = (reason?: string) => {
      if (activeCode.current !== code) return;
      setNotice(reason ?? null);
      setChat([
        ...next,
        {
          role: "assistant",
          content: automaticAnswer(question, context),
          source: "auto",
        },
      ]);
    };
    if (!online || !model) return fallback();
    mutation.mutate(
      {
        state_code: context.stateCode,
        target_year: context.projection!.targetYear,
        election_type: context.projection!.electionType,
        model,
        messages: next
          .slice(-MAX_MESSAGES)
          .map(({ role, content }) => ({ role, content })),
      },
      {
        onSuccess: (reply) => {
          if (activeCode.current !== code) return;
          setNotice(null);
          setChat([
            ...next,
            {
              role: "assistant",
              content: reply.answer,
              source: "ollama",
              model: reply.model,
            },
          ]);
        },
        onError: (error) =>
          fallback(`${error.message} Se muestra una lectura automática.`),
      },
    );
  };
  const connection = status.isPending
    ? { label: "Comprobando…", tone: "pending" }
    : online
      ? {
          label:
            status.data?.provider === "groq"
              ? "Groq configurado"
              : status.data?.provider === "gemini"
                ? "Gemini configurado"
                : "Ollama conectado",
          tone: "online",
        }
      : status.data?.reachable
        ? { label: "Sin modelo instalado", tone: "offline" }
        : {
            label:
              status.data?.provider === "groq"
                ? "Groq sin configurar"
                : status.data?.provider === "gemini"
                  ? "Gemini sin configurar"
                  : "Ollama sin conexión",
            tone: "offline",
          };
  return (
    <section className="section-card ai-assistant" aria-labelledby="ai-title">
      <header className="section-card-heading ai-assistant-heading">
        <span className="ai-assistant-avatar" aria-hidden="true">
          <Sparkles />
        </span>
        <div>
          <h2 id="ai-title">Asistente IA</h2>
          <p>Consulta proyecciones y sus límites con datos del INE</p>
        </div>
        <span
          className="ai-connection"
          data-tone={connection.tone}
          role="status"
        >
          <i />
          {connection.label}
        </span>
      </header>
      <div className="ai-assistant-config">
        <label>
          <Cpu aria-hidden="true" />
          <span>Modelo de IA</span>
          {models.length ? (
            <DashboardSelect
              aria-label="Modelo de IA"
              value={model ?? ""}
              onChange={(e) => setChosenModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </DashboardSelect>
          ) : (
            <strong>Por definir</strong>
          )}
        </label>
        <form
          className="ai-horizon-controls"
          onSubmit={(e) => {
            e.preventDefault();
            setTargetYear(
              Number(yearInput ?? baseContext?.forecast.target_year),
            );
          }}
        >
          <label>
            Año objetivo
            <input
              aria-label="Año objetivo del asistente"
              type="number"
              min={cutoff + 1}
              max={2029}
              step={1}
              value={
                yearInput ?? String(baseContext?.forecast.target_year ?? "")
              }
              onChange={(e) => setYearInput(e.target.value)}
              required
            />
          </label>
          <label>
            Tipo de referencia
            <DashboardSelect
              aria-label="Tipo de elección del asistente"
              value={
                electionType ?? baseContext?.forecast.election_type ?? "midterm"
              }
              onChange={(e) => setElectionType(e.target.value as ElectionType)}
            >
              <option value="midterm">Intermedia</option>
              <option value="presidential">Presidencial</option>
            </DashboardSelect>
          </label>
          <button type="submit" disabled={!baseContext}>
            Calcular proyección
          </button>
        </form>
        {horizon.error && (
          <p role="alert" className="ai-error-notice">
            {horizon.error}
          </p>
        )}
        {projection && (
          <div
            className="ai-projection-result"
            aria-label="Proyección del asistente"
            aria-live="polite"
          >
            <strong>
              {projection.kind === "registered"
                ? "Pronóstico registrado"
                : "Proyección de referencia"}{" "}
              · {projection.targetYear}
            </strong>
            <p>
              Abstención {(projection.abstention * 100).toFixed(1)}% ·
              Participación {(projection.participation * 100).toFixed(1)}%
            </p>
            <small>
              Referencia {projection.referenceYear} · Corte{" "}
              {projection.cutoffYear} · INE CCPC, fuente {projection.sourceId}
            </small>
            {projection.lower != null && projection.upper != null && (
              <p className="ai-projection-band">Rango de abstención: {(projection.lower * 100).toFixed(1)}% – {(projection.upper * 100).toFixed(1)}%</p>
            )}
            <p>{projection.method}</p>
            <p>{projection.warning}</p>
          </div>
        )}
        <ul className="ai-context-chips" aria-label="Contexto del asistente">
          <li>
            <MapPin aria-hidden="true" />
            {context?.state ?? "Sin entidad"}
          </li>
          <li>
            <Database aria-hidden="true" />
            INE · CCPC hasta {cutoff}
          </li>
          <li>Horizonte {projection?.targetYear ?? "—"}</li>
        </ul>
      </div>
      {!status.isPending && !online && (
        <p className="ai-offline-notice">
          <strong>El asistente no está conectado.</strong> Las respuestas son
          lecturas automáticas calculadas con reglas sobre los mismos datos.
          Configura{" "}
          <code>
            {status.data?.provider === "gemini"
              ? "GEMINI_API_KEY"
              : status.data?.provider === "ollama"
                ? "OLLAMA_URL"
                : "GROQ_API_KEY"}
          </code>{" "}
          en el servidor para activar el modelo.
        </p>
      )}
      <div
        className="ai-chat-log"
        ref={log}
        aria-live="polite"
        aria-busy={mutation.isPending}
        tabIndex={0}
        aria-label="Conversación con el asistente"
      >
        <div className="ai-message" data-role="assistant">
          <span className="ai-message-avatar" aria-hidden="true">
            <Bot />
          </span>
          <div>
            <p>
              {context
                ? `Hola. Puedo explicarte la estimación de ${context.state} para ${context.projection?.targetYear}, su histórico y sus límites. Las cifras provienen del modelo y de los conteos del INE; no las invento.`
                : "Selecciona una entidad para comenzar."}
            </p>
          </div>
        </div>
        {chat.map((entry, index) => (
          <div className="ai-message" data-role={entry.role} key={index}>
            {entry.role === "assistant" && (
              <span className="ai-message-avatar" aria-hidden="true">
                <Bot />
              </span>
            )}
            <div>
              <p>{entry.content}</p>
              {entry.role === "assistant" && (
                <small>
                  {entry.source === "ollama"
                    ? `IA · ${entry.model}`
                    : "Lectura automática · sin modelo de IA"}
                </small>
              )}
            </div>
          </div>
        ))}
        {mutation.isPending && (
          <div className="ai-message" data-role="assistant">
            <span className="ai-message-avatar" aria-hidden="true">
              <Bot />
            </span>
            <div>
              <p
                className="ai-typing"
                aria-label="El asistente está escribiendo"
              >
                <i />
                <i />
                <i />
              </p>
            </div>
          </div>
        )}
      </div>
      {notice && <p className="ai-error-notice">{notice}</p>}
      <div className="ai-suggestions" aria-label="Preguntas sugeridas">
        {suggestions.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => send(s)}
            disabled={!context || mutation.isPending}
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          aria-label="Pregunta para el asistente"
          placeholder={
            context
              ? `Pregunta sobre ${context.state}…`
              : "Selecciona una entidad"
          }
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!context}
        />
        <button
          type="button"
          className="ai-clear"
          aria-label="Borrar conversación"
          onClick={() => {
            setChat([]);
            setNotice(null);
          }}
          disabled={!chat.length || mutation.isPending}
        >
          <Trash2 />
        </button>
        <button
          type="submit"
          className="ai-send"
          aria-label="Enviar pregunta"
          disabled={!draft.trim() || !context || mutation.isPending}
        >
          <SendHorizontal />
        </button>
      </form>
      <p className="section-card-note">
        Las cifras se calculan con datos y métodos explícitos; la IA las
        explica. Las proyecciones son experimentales y no prueban causas ni
        efectos de intervenciones.
      </p>
    </section>
  );
}
