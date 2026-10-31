"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChartColumn,
  FileText,
  MapPin,
  MessageSquareText,
  PlusCircle,
  SendHorizontal,
  Sparkles,
  UserRound,
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
import { quotaSummary } from "@/lib/ai-quota";
import type { ElectionType } from "@/lib/types";
import { pct } from "@/lib/utils";
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

const providerName = (provider?: string) =>
  provider === "groq" ? "Groq" : provider === "gemini" ? "Gemini" : "Ollama";

/** Connection, chosen model, horizon and conversation shared by the assistant panel and the chat card. */
export function useAssistant(baseContext: AssistantContext | null) {
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
  const cutoff = baseContext
    ? Math.max(...baseContext.observedHistory.map((h) => h.year))
    : 2024;

  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: ({ signal }) => assistantStatus(signal),
    retry: false,
    staleTime: 30_000,
  });
  const queryClient = useQueryClient();
  const quota = status.data?.quota ?? null;
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const models = status.data?.models ?? [];
  const model =
    chosenModel && models.includes(chosenModel)
      ? chosenModel
      : (status.data?.defaultModel ?? null);
  const online = !!status.data?.reachable && !!model;
  const provider = status.data?.provider;
  const code = JSON.stringify(context);
  const activeCode = useRef(code);
  activeCode.current = code;
  useEffect(() => {
    activeCode.current = code;
    setChat([]);
    setNotice(null);
  }, [code]);
  const mutation = useMutation({ mutationFn: ask });
  const send = (text: string) => {
    const question = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!question || !context || mutation.isPending) return false;
    const next: ChatEntry[] = [...chat, { role: "user", content: question }];
    setChat(next);
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
    if (!online || !model) {
      fallback();
      return true;
    }
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
        // The counter follows the server: reuse the quota sent with the reply,
        // or re-read it after an error (a provider failure does not charge it).
        onSettled: (reply) => {
          if (reply?.quota)
            queryClient.setQueryData<AssistantStatus>(
              ["assistant-status"],
              (old) => (old ? { ...old, quota: reply.quota } : old),
            );
          else
            queryClient.invalidateQueries({ queryKey: ["assistant-status"] });
        },
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
    return true;
  };
  const connection = status.isPending
    ? { label: "Comprobando…", tone: "pending" }
    : online
      ? {
          label:
            provider === "groq" || provider === "gemini"
              ? `${providerName(provider)} configurado`
              : "Ollama conectado",
          tone: "online",
        }
      : status.data?.reachable
        ? { label: "Sin modelo instalado", tone: "offline" }
        : {
            label:
              provider === "groq" || provider === "gemini"
                ? `${providerName(provider)} sin configurar`
                : "Ollama sin conexión",
            tone: "offline",
          };
  return {
    baseContext,
    context,
    horizonError: horizon.error,
    targetYear,
    cutoff,
    yearInput,
    setYearInput,
    electionType,
    setElectionType,
    applyYear: () =>
      setTargetYear(Number(yearInput ?? baseContext?.forecast.target_year)),
    status,
    quota,
    models,
    model,
    setModel: setChosenModel,
    online,
    connection,
    provider,
    chat,
    notice,
    pending: mutation.isPending,
    send,
    reset: () => {
      setChat([]);
      setNotice(null);
    },
  };
}
type Assistant = ReturnType<typeof useAssistant>;

/** Right-hand panel: AI model, horizon settings and the resulting projection. */
export function AssistantPanel({
  assistant,
  stateName,
  onMethodology,
}: {
  assistant: Assistant;
  stateName: string;
  onMethodology?: () => void;
}) {
  const { baseContext, context, cutoff, models, model, connection, quota } =
    assistant;
  const projection = context?.projection;
  return (
    <section
      className="section-card ai-assistant ai-panel"
      aria-labelledby="ai-title"
    >
      <header className="section-card-heading ai-assistant-heading">
        <span className="ai-assistant-avatar" aria-hidden="true">
          <Sparkles />
        </span>
        <div>
          <h2 id="ai-title">Asistente IA</h2>
          <p>Configura y consulta la proyección</p>
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
      <form
        className="ai-fields"
        onSubmit={(e) => {
          e.preventDefault();
          assistant.applyYear();
        }}
      >
        <div className="ai-field ai-field-wide">
          <span>Modelo de IA</span>
          {models.length ? (
            <DashboardSelect
              aria-label="Modelo de IA"
              value={model ?? ""}
              onChange={(e) => assistant.setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </DashboardSelect>
          ) : (
            <strong className="ai-field-empty">Por definir</strong>
          )}
        </div>
        <label className="ai-field">
          <span>Año objetivo</span>
          <input
            aria-label="Año objetivo del asistente"
            type="number"
            min={cutoff + 1}
            max={2029}
            step={1}
            value={
              assistant.yearInput ??
              String(baseContext?.forecast.target_year ?? "")
            }
            onChange={(e) => assistant.setYearInput(e.target.value)}
            required
          />
        </label>
        <div className="ai-field">
          <span>Tipo de referencia</span>
          <DashboardSelect
            aria-label="Tipo de elección del asistente"
            value={
              assistant.electionType ??
              baseContext?.forecast.election_type ??
              "midterm"
            }
            onChange={(e) =>
              assistant.setElectionType(e.target.value as ElectionType)
            }
          >
            <option value="midterm">Intermedia</option>
            <option value="presidential">Presidencial</option>
          </DashboardSelect>
        </div>
        <button
          type="submit"
          className="ai-calc ai-field-wide"
          disabled={!baseContext}
        >
          Calcular proyección
        </button>
      </form>
      {assistant.horizonError && (
        <p role="alert" className="ai-error-notice">
          {assistant.horizonError}
        </p>
      )}
      <div
        className="ai-projection"
        aria-label="Proyección del asistente"
        aria-live="polite"
      >
        {projection ? (
          <>
            <strong className="ai-projection-title">
              {projection.kind === "registered"
                ? "Pronóstico registrado"
                : "Proyección de referencia"}{" "}
              · {projection.targetYear}
            </strong>
            <div className="ai-projection-values">
              <div>
                <span>Abstención</span>
                <b>{pct(projection.abstention)}</b>
              </div>
              <div>
                <span>Participación</span>
                <b>{pct(projection.participation)}</b>
              </div>
            </div>
            {projection.lower != null && projection.upper != null && (
              <p className="ai-projection-range">
                Rango de abstención: {pct(projection.lower)} –{" "}
                {pct(projection.upper)}
              </p>
            )}
            <p className="ai-projection-method">{projection.method}</p>
            <p className="ai-projection-method">{projection.warning}</p>
            <small className="ai-projection-method">
              Referencia {projection.referenceYear} · Corte{" "}
              {projection.cutoffYear} · INE CCPC, fuente {projection.sourceId}
            </small>
          </>
        ) : (
          <strong className="ai-projection-title">
            {baseContext ? "Proyección no disponible" : "Sin entidad"}
          </strong>
        )}
        {onMethodology && (
          <button type="button" className="ai-link" onClick={onMethodology}>
            Ver metodología y límites <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="ai-context-chips" aria-label="Contexto del asistente">
        <li>
          <MapPin aria-hidden="true" />
          {stateName}
        </li>
        <li>
          <FileText aria-hidden="true" />
          INE · CCPC hasta {cutoff}
        </li>
        <li>
          <ChartColumn aria-hidden="true" />
          Horizonte {projection?.targetYear ?? "—"}
        </li>
      </ul>
      {quota && (
        <p
          className="ai-quota"
          data-empty={quota.remaining <= 0 || undefined}
          aria-live="polite"
        >
          {quotaSummary(quota)}
        </p>
      )}
    </section>
  );
}

/** Full-width conversation card below the chart and the panel. */
export function AssistantChat({ assistant }: { assistant: Assistant }) {
  const { context, chat, notice, pending, online, status, provider, targetYear } =
    assistant;
  const projection = context?.projection;
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat.length]);
  const bot = (
    <span className="ai-message-avatar" aria-hidden="true">
      <Sparkles />
    </span>
  );
  return (
    <section className="section-card ai-chat" aria-labelledby="ai-chat-title">
      <header className="section-card-heading">
        <span className="ai-chat-icon" aria-hidden="true">
          <MessageSquareText />
        </span>
        <div>
          <h2 id="ai-chat-title">Conversa con la IA</h2>
          <p>
            Haz preguntas sobre los resultados, el histórico y los límites de la
            estimación.
          </p>
        </div>
        <button
          type="button"
          className="ai-new-chat"
          onClick={assistant.reset}
          disabled={!chat.length || pending}
        >
          <PlusCircle aria-hidden="true" />
          Nueva conversación
        </button>
      </header>
      {!status.isPending && !online && (
        <p className="ai-offline-notice">
          <strong>El asistente no está conectado.</strong> Las respuestas son
          lecturas automáticas calculadas con reglas sobre los mismos datos.
          Configura{" "}
          <code>
            {provider === "gemini"
              ? "GEMINI_API_KEY"
              : provider === "ollama"
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
        aria-busy={pending}
        tabIndex={0}
        aria-label="Conversación con el asistente"
      >
        <div className="ai-message" data-role="assistant">
          {bot}
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
            {entry.role === "assistant" && bot}
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
            {entry.role === "user" && (
              <span className="ai-user-avatar" aria-hidden="true">
                <UserRound />
              </span>
            )}
          </div>
        ))}
        {pending && (
          <div className="ai-message" data-role="assistant">
            {bot}
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
        {(context && projection && targetYear !== null ? [
          `¿Cómo se calculó la estimación de ${context.state} para ${projection.targetYear} y qué datos la respaldan?`,
          "¿Qué mecanismos de seguimiento permiten anticipar este escenario?",
          "¿Qué señales de alerta debemos revisar y qué datos faltan?",
        ] : suggestions).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => assistant.send(s)}
            disabled={!context || pending}
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (assistant.send(draft)) setDraft("");
        }}
      >
        <MessageSquareText className="ai-composer-icon" aria-hidden="true" />
        <input
          aria-label="Pregunta para el asistente"
          placeholder={
            context
              ? `Escribe tu pregunta sobre ${context.state}…`
              : "Selecciona una entidad"
          }
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!context}
        />
        <button
          type="submit"
          className="ai-send"
          aria-label="Enviar pregunta"
          disabled={!draft.trim() || !context || pending}
        >
          <SendHorizontal aria-hidden="true" />
          <span>Enviar</span>
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
