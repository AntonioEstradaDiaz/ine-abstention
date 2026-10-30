import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_BUDGET_MS,
  formatResetTime,
  quotaErrorResponse,
  quotaSummary,
  runWithQuota,
  type FinishResult,
  type ReserveResult,
} from "../src/lib/ai-quota.ts";

const resets = "2026-10-30T06:00:00+00:00"; // 00:00 en Ciudad de México
const reserved: ReserveResult = { ok: true, reservation_id: "r-1", remaining: 7, limit: 30, resets_at: resets };
const finished = (remaining: number): FinishResult => ({ remaining, limit: 30, resets_at: resets, updated: true });

function harness(reserve: () => Promise<ReserveResult>) {
  const calls = { provider: 0, finish: [] as Array<[string, boolean]> };
  return {
    calls,
    reserve,
    finish: async (id: string, ok: boolean) => {
      calls.finish.push([id, ok]);
      return finished(ok ? 7 : 8);
    },
  };
}

test("a quota rejection never reaches the provider", async () => {
  const rejections: ReserveResult[] = [
    { ok: false, code: "daily_limit", remaining: 0, limit: 30, resets_at: resets },
    { ok: false, code: "global_limit", remaining: 4, limit: 30, resets_at: resets },
    { ok: false, code: "rate_limit", remaining: 4, limit: 30, resets_at: resets, retry_after_seconds: 12 },
  ];
  for (const rejection of rejections) {
    const h = harness(async () => rejection);
    const result = await runWithQuota({
      ...h,
      call: async () => { h.calls.provider++; return "no"; },
      signal: new AbortController().signal,
    });
    assert.equal(h.calls.provider, 0);
    assert.deepEqual(h.calls.finish, []);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.response.status, 429);
    assert.equal(result.response.body.code, rejection.code);
    assert.deepEqual(result.response.body.quota, { remaining: rejection.remaining, limit: 30, resets_at: resets });
    // Design §6: resets_at for day-long limits; rate_limit carries retry_after_seconds instead.
    assert.equal(result.response.body.resets_at, rejection.code === "rate_limit" ? undefined : resets);
  }
});

test("rate_limit tells how long to wait, in body and Retry-After", () => {
  const response = quotaErrorResponse("rate_limit", { retryAfterSeconds: 12 });
  assert.equal(response.headers["Retry-After"], "12");
  assert.equal(response.body.retry_after_seconds, 12);
  assert.match(response.body.detail, /espera 12 segundos/);
  assert.match(quotaErrorResponse("rate_limit", { retryAfterSeconds: 1 }).body.detail, /espera 1 segundo antes/);
});

test("daily and global limits explain when the quota resets", () => {
  const daily = quotaErrorResponse("daily_limit", { limit: 30, resetsAt: resets });
  assert.match(daily.body.detail, /30 consultas de hoy/);
  assert.match(daily.body.detail, /00:00 \(hora del centro de México\)/);
  const global = quotaErrorResponse("global_limit", { resetsAt: resets });
  assert.match(global.body.detail, /todos los usuarios/);
  assert.match(global.body.detail, /00:00/);
});

test("the counter tells how many queries are left and when they reset", () => {
  assert.equal(
    quotaSummary({ remaining: 29, limit: 30, resets_at: resets }),
    "Te quedan 29 de 30 consultas hoy · se reinician a las 00:00 (hora del centro)",
  );
  assert.match(quotaSummary({ remaining: 1, limit: 30, resets_at: resets }), /^Te queda 1 de 30 consultas hoy/);
  assert.equal(
    quotaSummary({ remaining: 0, limit: 30, resets_at: resets }),
    "Usaste tus 30 consultas de hoy · se reinician a las 00:00 (hora del centro)",
  );
});

test("the reset instant is shown as Mexico City local time", () => {
  assert.equal(formatResetTime(resets), "00:00");
  assert.equal(formatResetTime("not a date"), null);
});

test("if the quota cannot be checked, the request fails closed", async () => {
  const h = harness(async () => { throw new Error("Supabase caído"); });
  const result = await runWithQuota({
    ...h,
    call: async () => { h.calls.provider++; return "no"; },
    signal: new AbortController().signal,
  });
  assert.equal(h.calls.provider, 0);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 503);
    assert.equal(result.response.body.code, "quota_unavailable");
  }
});

test("a successful reply confirms the reservation and returns the updated quota", async () => {
  const h = harness(async () => reserved);
  const result = await runWithQuota({ ...h, call: async () => "Respuesta", signal: new AbortController().signal });
  assert.deepEqual(h.calls.finish, [["r-1", true]]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "Respuesta");
    assert.deepEqual(result.quota, { remaining: 7, limit: 30, resets_at: resets });
  }
});

test("if confirming fails after a reply, the user still gets the answer", async () => {
  const h = harness(async () => reserved);
  const result = await runWithQuota({
    ...h,
    finish: async () => { throw new Error("Supabase caído"); },
    call: async () => "Respuesta",
    signal: new AbortController().signal,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.quota, { remaining: 7, limit: 30, resets_at: resets });
});

test("a confirmation that throws synchronously still returns the answer", async () => {
  const h = harness(async () => reserved);
  const result = await runWithQuota({
    ...h,
    finish: () => { throw new Error("Falta PULSO_AI_QUOTA_SECRET"); },
    call: async () => "Respuesta",
    signal: new AbortController().signal,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "Respuesta");
});

test("a provider error releases the quota and says it was not charged", async () => {
  const h = harness(async () => reserved);
  const result = await runWithQuota({
    ...h,
    call: async () => { throw new Error("Groq no pudo responder. Intenta nuevamente."); },
    signal: new AbortController().signal,
  });
  assert.deepEqual(h.calls.finish, [["r-1", false]]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 502);
    assert.equal(result.response.body.code, "provider_error");
    assert.match(result.response.body.detail, /^Groq no pudo responder\. Intenta nuevamente\. No se descontó de tu cuota\.$/);
    assert.deepEqual(result.response.body.quota, { remaining: 8, limit: 30, resets_at: resets });
  }
});

test("running out of time releases the quota and reports a timeout", async () => {
  const budget = new AbortController();
  const h = harness(async () => reserved);
  const result = await runWithQuota({
    ...h,
    call: async () => { budget.abort(new DOMException("Timeout", "TimeoutError")); throw new Error("Groq tardó demasiado."); },
    signal: budget.signal,
  });
  assert.deepEqual(h.calls.finish, [["r-1", false]]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 504);
    assert.equal(result.response.body.code, "provider_timeout");
    assert.match(result.response.body.detail, new RegExp(`más de ${AI_BUDGET_MS / 1000} segundos`));
  }
});

test("if the budget is already spent, nothing is reserved", async () => {
  const budget = new AbortController();
  budget.abort();
  let reserved_ = 0;
  const result = await runWithQuota({
    reserve: async () => { reserved_++; return reserved; },
    finish: async () => finished(7),
    call: async () => "no",
    signal: budget.signal,
  });
  assert.equal(reserved_, 0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.body.code, "provider_timeout");
});
