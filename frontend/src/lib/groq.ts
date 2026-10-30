// Server-side only: credentials must never reach the browser.
export async function generateGroqReply({ apiKey, model, system, messages, signal }: {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Caller's time budget; replaces the default 45 s timeout. */
  signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], temperature: 0.2, max_completion_tokens: 1024, stream: false }),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(45_000),
  }).catch(() => { throw new Error("Groq no está disponible o tardó demasiado. Intenta nuevamente."); });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Se alcanzó el límite de Groq. Espera antes de volver a consultar.");
    if ([401, 403].includes(response.status)) throw new Error("Revisa la clave y los permisos de Groq en el servidor.");
    if ([400, 404].includes(response.status)) throw new Error("Revisa el modelo GROQ_MODEL y su disponibilidad en tu cuenta.");
    throw new Error("Groq no pudo responder. Intenta nuevamente.");
  }
  const data = await response.json().catch(() => { throw new Error("Groq devolvió una respuesta inválida."); }) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("Groq no devolvió una respuesta. Reformula la pregunta.");
  return answer;
}
