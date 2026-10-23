import { test } from "node:test";
import assert from "node:assert/strict";
import { generateGroqReply } from "../src/lib/groq.ts";
const input = { apiKey: "test-secret", model: "qwen/qwen3.8-27b", system: "Datos del INE", messages: [{role:"user" as const,content:"Explica"}] };
test("private header, server context and extraction",async()=>{
 const fake=(async(url,init)=>{assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");assert.equal((init!.headers as Record<string,string>).Authorization,"Bearer test-secret");const body=JSON.parse(init!.body as string);assert.equal(body.messages[0].content,input.system);assert.equal(body.messages[1].content,"Explica");return Response.json({choices:[{message:{content:"Respuesta"}}]});}) as typeof fetch;
 assert.equal(await generateGroqReply(input,fake),"Respuesta");
});
test("safe quota and authentication errors",async()=>{
 for (const [status,message] of [[429,/límite/],[401,/clave/],[404,/modelo/]] as const) await assert.rejects(generateGroqReply(input,(async()=>Response.json({secret:"test-secret"},{status})) as typeof fetch),message);
});
test("empty replies are rejected",async()=>{await assert.rejects(generateGroqReply(input,(async()=>Response.json({choices:[]})) as typeof fetch),/no devolvió/);});
