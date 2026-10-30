import { test } from "node:test";
import assert from "node:assert/strict";
import { generateGeminiReply } from "../src/lib/gemini.ts";
const input = { apiKey: "test-key", model: "gemini-2.5-flash", system: "Solo datos del INE", messages: [{ role: "assistant" as const, content: "Anterior" }, { role: "user" as const, content: "Compara" }] };
test("sends private key in header and maps model roles, extracts visible answer", async () => {
 const mock = (async (url, init) => {
  assert.ok(!String(url).includes("test-key"));
  assert.equal((init!.headers as Record<string,string>)["x-goog-api-key"], "test-key");
  const body = JSON.parse(init!.body as string);
  assert.equal(body.contents[0].role, "model");
  assert.equal(body.systemInstruction.parts[0].text, input.system);
  return Response.json({candidates:[{content:{parts:[{thought:true,text:"internal"},{text:"Respuesta"}]}}]});
 }) as typeof fetch;
 assert.equal(await generateGeminiReply(input,mock), "Respuesta");
});
test("quota failure is actionable and never exposes upstream details", async () => {
 await assert.rejects(generateGeminiReply(input, (async()=>Response.json({error:"test-key"},{status:429})) as typeof fetch), /cuota/);
});
test("empty or blocked response is not presented as an answer", async () => {
 await assert.rejects(generateGeminiReply(input, (async()=>Response.json({candidates:[]})) as typeof fetch), /no devolvió/);
});
test("caller's time budget replaces the fixed timeout", async () => {
 const budget = new AbortController();
 const ok = (async (_url, init) => { assert.equal(init!.signal, budget.signal); return Response.json({candidates:[{content:{parts:[{text:"Respuesta"}]}}]}); }) as typeof fetch;
 assert.equal(await generateGeminiReply({ ...input, signal: budget.signal }, ok), "Respuesta");
 budget.abort();
 await assert.rejects(generateGeminiReply({ ...input, signal: budget.signal }, (async (_url, init) => { if (init!.signal!.aborted) throw new DOMException("Aborted", "AbortError"); return Response.json({}); }) as typeof fetch), /tardó demasiado/);
});
