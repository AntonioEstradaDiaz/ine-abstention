import { projectHorizon } from "@/lib/assistant-projection";
import { NextRequest, NextResponse } from "next/server";
import snapshot from "@/lib/preview-data.json";
import { backendInternalHeaders } from "@/lib/backend-internal";
import {
  buildAssistantContext,
  systemPrompt,
  validMessages,
  type AssistantReply,
  type AssistantStatus,
} from "@/lib/assistant";
import type { Indicator, ModelMetrics, Page, Predictions } from "@/lib/types";

export const dynamic = "force-dynamic";
import { generateGroqReply } from "@/lib/groq";
import { generateGeminiReply } from "@/lib/gemini";
import { authServer } from "@/lib/supabase/server";
import {
  AI_BUDGET_MS,
  quotaRpcs,
  readQuotaStatus,
  runWithQuota,
  type QuotaErrorResponse,
  type QuotaRpcClient,
} from "@/lib/ai-quota";
const provider = () =>
  process.env.AI_PROVIDER === "ollama"
    ? "ollama"
    : process.env.AI_PROVIDER === "gemini"
      ? "gemini"
      : "groq";
const groqModel = () => process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ollamaUrl = () => process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const detail = (message: string, status: number) =>
  NextResponse.json({ detail: message }, { status });

// Quota RPCs run with the user's session; changing counts also requires the
// server-only secret, so the browser cannot reserve or release slots itself.
async function quotaClient(): Promise<QuotaRpcClient | null> {
  const supabase = await authServer();
  return supabase && { rpc: (fn, args) => supabase.rpc(fn, args) };
}

function quotaSecret() {
  const secret = process.env.PULSO_AI_QUOTA_SECRET;
  if (!secret || secret.length < 32) throw new Error("Falta PULSO_AI_QUOTA_SECRET");
  return secret;
}

async function quotaStatus() {
  try {
    return await readQuotaStatus(await quotaClient());
  } catch {
    return null;
  }
}

function quotaFailure({ status, body, headers }: QuotaErrorResponse) {
  // Code only: no user id, question or answer in logs.
  console.warn(JSON.stringify({ event: "ai_quota", code: body.code }));
  return NextResponse.json(body, { status, headers });
}

async function installedModels(): Promise<string[] | null> {
  try {
    const response = await fetch(new URL("/api/tags", ollamaUrl()), {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name).sort();
  } catch {
    return null;
  }
}

// OLLAMA_MODEL wins when installed; otherwise the first installed model.
const defaultModel = (models: string[]) => {
  const configured = process.env.OLLAMA_MODEL;
  return configured && models.includes(configured)
    ? configured
    : (models[0] ?? null);
};

export async function GET() {
  const quota = quotaStatus();
  if (provider() === "groq") {
    return NextResponse.json(
      {
        provider: "groq",
        reachable: !!process.env.GROQ_API_KEY,
        models: [groqModel()],
        defaultModel: groqModel(),
        quota: await quota,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (provider() === "gemini") {
    return NextResponse.json(
      {
        provider: "gemini",
        reachable: !!process.env.GEMINI_API_KEY,
        models: [geminiModel()],
        defaultModel: geminiModel(),
        quota: await quota,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const models = await installedModels();
  const status: AssistantStatus = {
    provider: "ollama",
    reachable: models != null,
    models: models ?? [],
    defaultModel: models ? defaultModel(models) : null,
    quota: await quota,
  };
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}

async function backend<T>(path: string, budget: AbortSignal): Promise<T> {
  const base = process.env.BACKEND_URL || "http://127.0.0.1:8001";
  const response = await fetch(new URL(`/api/v1/${path}`, base), {
    headers: { Accept: "application/json", ...backendInternalHeaders() },
    cache: "no-store",
    signal: AbortSignal.any([budget, AbortSignal.timeout(15_000)]),
  });
  if (!response.ok) throw new Error(`Backend ${response.status}`);
  return (await response.json()) as T;
}

// INE facts are read on the server, never trusted from the browser.
async function ineData(stateCode: string, budget: AbortSignal) {
  if (process.env.PULSO_PREVIEW === "1")
    return {
      predictions: snapshot.predictions as Predictions,
      history: (snapshot.history as Indicator[]).filter(
        (r) => r.state_code === stateCode,
      ),
      metrics: snapshot.metrics as ModelMetrics,
    };
  const predictions = await backend<Predictions>(
    "predictions?target_year=2027&limit=100",
    budget,
  );
  const [history, metrics] = await Promise.all([
    backend<Page<Indicator>>(
      `participation/history?territory_type=state&state_code=${stateCode}&limit=100`,
      budget,
    ),
    backend<ModelMetrics>(
      `models/metrics?run_id=${encodeURIComponent(predictions.forecast.provenance.model_run_id)}`,
      budget,
    ).catch(() => null),
  ]);
  return { predictions, history: history.items, metrics };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host"))
        return detail("Origen no permitido.", 403);
    } catch {
      return detail("Origen no permitido.", 403);
    }
  }
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return detail("Se requiere application/json.", 415);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 32_768)
    return new NextResponse(null, { status: 413 });
  let body: {
    state_code?: unknown;
    model?: unknown;
    messages?: unknown;
    target_year?: unknown;
    election_type?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return detail("JSON inválido.", 400);
  }
  const messages = validMessages(body.messages);
  const stateCode =
    typeof body.state_code === "string" && /^\d{2}$/.test(body.state_code)
      ? body.state_code
      : null;
  if (!messages || !stateCode) return detail("Solicitud inválida.", 400);

  if (
    body.target_year !== undefined &&
    (typeof body.target_year !== "number" ||
      !Number.isInteger(body.target_year) ||
      body.target_year < 2025 ||
      body.target_year > 2029)
  )
    return detail("Año objetivo inválido.", 400);
  if (
    body.election_type !== undefined &&
    body.election_type !== "midterm" &&
    body.election_type !== "presidential"
  )
    return detail("Tipo de elección inválido.", 400);
  let model: string;
  if (provider() === "groq") {
    if (!process.env.GROQ_API_KEY)
      return detail("Falta configurar GROQ_API_KEY en el servidor.", 503);
    model = groqModel();
  } else if (provider() === "gemini") {
    if (!process.env.GEMINI_API_KEY)
      return detail("Falta configurar GEMINI_API_KEY en el servidor.", 503);
    model = geminiModel();
  } else {
    const models = await installedModels();
    if (!models) return detail("Ollama sin conexión.", 503);
    const selectedModel =
      typeof body.model === "string" && models.includes(body.model)
        ? body.model
        : defaultModel(models);
    if (!selectedModel)
      return detail("No hay un modelo de Ollama disponible.", 503);
    model = selectedModel;
  }

  // One 45 s budget for the whole request: INE data lookup plus the AI provider.
  const budget = AbortSignal.timeout(AI_BUDGET_MS);
  let data: Awaited<ReturnType<typeof ineData>>;
  try {
    data = await ineData(stateCode, budget);
  } catch {
    return detail("No se pudieron consultar los datos del INE.", 503);
  }
  const prediction = data.predictions.items.find(
    (p) => p.state_code === stateCode,
  );
  if (!prediction) return detail("Entidad sin estimación.", 404);
  const selected = data.metrics?.models.find(
    (m) => m.status === "development_selected",
  );
  const context = buildAssistantContext({
    prediction,
    forecast: data.predictions.forecast,
    states: data.predictions.items,
    history: data.history,
    thresholds: data.predictions.forecast.calibration.risk.thresholds,
    model:
      selected?.model_name ?? data.predictions.forecast.provenance.model_name,
    maePP: selected?.metrics.holdout_2024.mae_pp ?? null,
  });
  try {
    context.projection = projectHorizon(
      data.history,
      stateCode,
      (body.target_year as number) ?? data.predictions.forecast.target_year,
      (body.election_type as "midterm" | "presidential") ??
        data.predictions.forecast.election_type,
      { forecast: data.predictions.forecast, prediction },
    );
  } catch (error) {
    return detail(
      error instanceof Error ? error.message : "Horizonte no disponible.",
      422,
    );
  }
  const system = systemPrompt(context);
  const outcome = await runWithQuota({
    ...quotaRpcs(await quotaClient(), quotaSecret, budget),
    call: (signal) => generateReply(model, system, messages, signal),
    signal: budget,
  });
  if (!outcome.ok) return quotaFailure(outcome.response);
  const reply: AssistantReply = {
    answer: outcome.value,
    model,
    quota: outcome.quota,
  };
  return NextResponse.json(reply, {
    headers: { "Cache-Control": "no-store" },
  });
}

async function generateReply(
  model: string,
  system: string,
  messages: NonNullable<ReturnType<typeof validMessages>>,
  signal: AbortSignal,
): Promise<string> {
  if (provider() === "groq")
    return generateGroqReply({
      apiKey: process.env.GROQ_API_KEY!,
      model,
      system,
      messages,
      signal,
    });
  if (provider() === "gemini")
    return generateGeminiReply({
      apiKey: process.env.GEMINI_API_KEY!,
      model,
      system,
      messages,
      signal,
    });
  const response = await fetch(new URL("/api/chat", ollamaUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.2 },
      messages: [{ role: "system", content: system }, ...messages],
    }),
    cache: "no-store",
    signal,
  }).catch(() => {
    throw new Error("Ollama tardó demasiado o no está disponible.");
  });
  if (!response.ok) throw new Error("Ollama no pudo responder.");
  const result = (await response.json().catch(() => {
    throw new Error("Ollama devolvió una respuesta inválida.");
  })) as {
    message?: { content?: string };
  };
  const answer = result?.message?.content?.trim();
  if (!answer) throw new Error("Ollama devolvió una respuesta vacía.");
  return answer;
}
