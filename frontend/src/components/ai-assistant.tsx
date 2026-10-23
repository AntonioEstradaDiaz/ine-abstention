"use client";
import { useEffect, useRef, useState } from "react";
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
import { DashboardSelect } from "./ui/dashboard-select";

const suggestions = [
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
      typeof data?.detail === "string" ? data.detail : "El asistente no respondió.",
    );
  return data as AssistantReply;
}

export function AiAssistant({ context }: { context: AssistantContext | null }) {
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
  const code = context?.stateCode;
  const activeCode = useRef(code);
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
      if (activeCode.current !== context.stateCode) return;
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
        model,
        messages: next
          .slice(-MAX_MESSAGES)
          .map(({ role, content }) => ({ role, content })),
      },
      {
        onSuccess: (reply) => {
          if (activeCode.current !== context.stateCode) return;
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
      ? { label: status.data?.provider === "groq" ? "Groq configurado" : status.data?.provider === "gemini" ? "Gemini configurado" : "Ollama conectado", tone: "online" }
      : status.data?.reachable
        ? { label: "Sin modelo instalado", tone: "offline" }
        : { label: status.data?.provider === "groq" ? "Groq sin configurar" : status.data?.provider === "gemini" ? "Gemini sin configurar" : "Ollama sin conexión", tone: "offline" };
  return (
    <section className="section-card ai-assistant" aria-labelledby="ai-title">
      <header className="section-card-heading ai-assistant-heading">
        <span className="ai-assistant-avatar" aria-hidden="true">
          <Sparkles />
        </span>
        <div>
          <h2 id="ai-title">Asistente IA</h2>
          <p>Explica las predicciones con datos abiertos del INE</p>
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
        <ul className="ai-context-chips" aria-label="Contexto del asistente">
          <li>
            <MapPin aria-hidden="true" />
            {context?.state ?? "Sin entidad"}
          </li>
          <li>
            <Database aria-hidden="true" />
            INE · CCPC 2009–2024
          </li>
          <li>Estimación 2027</li>
        </ul>
      </div>
      {!status.isPending && !online && (
        <p className="ai-offline-notice">
          <strong>El asistente no está conectado.</strong> Las respuestas son lecturas
          automáticas calculadas con reglas sobre los mismos datos. Configura{" "}
          <code>{status.data?.provider === "gemini" ? "GEMINI_API_KEY" : status.data?.provider === "ollama" ? "OLLAMA_URL" : "GROQ_API_KEY"}</code> en el servidor para activar el
          modelo.
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
                ? `Hola. Puedo explicarte la estimación de ${context.state} para 2027, su histórico y sus límites. Las cifras provienen del modelo y de los conteos del INE; no las invento.`
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
        El asistente explica cifras existentes; no genera predicciones, no
        atribuye causas ni recomienda intervenciones.
      </p>
    </section>
  );
}
