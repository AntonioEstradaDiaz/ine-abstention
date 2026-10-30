// Server-side only: never import this module from a browser component.
export async function generateGeminiReply({ apiKey, model, system, messages, signal }: {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Caller's time budget; replaces the default 60 s timeout. */
  signal?: AbortSignal;
}, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
    }),
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(60_000),
  }).catch(() => { throw new Error("Gemini no está disponible o tardó demasiado. Intenta nuevamente."); });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Se alcanzó la cuota de Gemini. Espera antes de volver a consultar.");
    if ([400, 401, 403].includes(response.status)) throw new Error("Revisa la clave y los permisos de Gemini en el servidor.");
    throw new Error("Gemini no pudo responder. Revisa el modelo configurado o intenta nuevamente.");
  }
  const data = await response.json().catch(() => { throw new Error("Gemini devolvió una respuesta inválida."); }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const answer = data.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
  if (!answer) throw new Error("Gemini no devolvió una respuesta. Reformula la pregunta.");
  return answer;
}
