import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_BUDGET_MS,
  callQuotaRpc,
  formatResetTime,
  quotaErrorResponse,
  quotaRpcs,
  quotaSummary,
  readQuotaStatus,
  runWithQuota,
  type FinishResult,
  type QuotaRpcClient,
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
    // The harness confirms the refund (updated: true), so the note must be there.
    assert.match(result.response.body.detail, /No se descontó de tu cuota\.$/);
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

// Supabase client stand-ins: answers immediately, or hangs until its signal aborts.
function rpcClient(reply: () => { data: unknown; error: unknown }, seen: Array<{ fn: string; args?: Record<string, unknown>; signal: AbortSignal }> = []): QuotaRpcClient {
  return {
    rpc: (fn, args) => ({
      abortSignal: (signal) => {
        seen.push({ fn, args, signal });
        return Promise.resolve(reply());
      },
    }),
  };
}
const hangingClient: QuotaRpcClient = {
  rpc: () => ({
    abortSignal: (signal) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  }),
};

test("quota RPCs pass the caller's signal and return the data", async () => {
  const seen: Array<{ fn: string; signal: AbortSignal }> = [];
  const signal = new AbortController().signal;
  const data = await callQuotaRpc(rpcClient(() => ({ data: { remaining: 3 }, error: null }), seen), "pulso_ai_quota_status", undefined, signal);
  assert.deepEqual(data, { remaining: 3 });
  assert.equal(seen[0].signal, signal);
});

test("quota RPCs fail on errors, empty data or a missing client", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(callQuotaRpc(rpcClient(() => ({ data: null, error: { message: "boom" } })), "f", undefined, signal));
  await assert.rejects(callQuotaRpc(rpcClient(() => ({ data: null, error: null })), "f", undefined, signal));
  await assert.rejects(callQuotaRpc(null, "f", undefined, signal));
});

test("a hanging Supabase call is cut off by its signal", async () => {
  const started = Date.now();
  await assert.rejects(callQuotaRpc(hangingClient, "pulso_ai_reserve", {}, AbortSignal.timeout(30)));
  assert.ok(Date.now() - started < 1_000);
});

test("reserve uses the request budget; finish has its own limit even after the budget ran out", async () => {
  const seen: Array<{ fn: string; args?: Record<string, unknown>; signal: AbortSignal }> = [];
  const budget = new AbortController();
  const rpcs = quotaRpcs(
    rpcClient(() => ({ data: { remaining: 1, limit: 30, resets_at: resets, updated: true }, error: null }), seen),
    () => "s".repeat(40),
    budget.signal,
  );
  await rpcs.reserve();
  assert.equal(seen[0].fn, "pulso_ai_reserve");
  assert.equal(seen[0].signal, budget.signal);
  assert.deepEqual(seen[0].args, { p_secret: "s".repeat(40) });
  budget.abort();
  await rpcs.finish("r-1", false);
  assert.equal(seen[1].fn, "pulso_ai_finish");
  assert.notEqual(seen[1].signal, budget.signal);
  assert.equal(seen[1].signal.aborted, false);
  assert.deepEqual(seen[1].args, { p_secret: "s".repeat(40), p_reservation: "r-1", p_succeeded: false });
});

test("finish gives up after its own short limit", async () => {
  const rpcs = quotaRpcs(hangingClient, () => "s".repeat(40), new AbortController().signal, 30);
  const started = Date.now();
  await assert.rejects(rpcs.finish("r-1", true));
  assert.ok(Date.now() - started < 1_000);
});

test("a missing secret makes the reservation fail without calling Supabase", async () => {
  const seen: Array<{ fn: string; signal: AbortSignal }> = [];
  const rpcs = quotaRpcs(rpcClient(() => ({ data: {}, error: null }), seen), () => { throw new Error("Falta PULSO_AI_QUOTA_SECRET"); }, new AbortController().signal);
  const result = await runWithQuota({ ...rpcs, call: async () => "no", signal: new AbortController().signal });
  assert.equal(seen.length, 0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.body.code, "quota_unavailable");
});

test("the status read returns null instead of hanging", async () => {
  const started = Date.now();
  assert.equal(await readQuotaStatus(hangingClient, 30), null);
  assert.ok(Date.now() - started < 1_000);
  assert.deepEqual(
    await readQuotaStatus(rpcClient(() => ({ data: { remaining: 4, limit: 30, resets_at: resets, global_exhausted: false }, error: null }))),
    { remaining: 4, limit: 30, resets_at: resets },
  );
});

test("'not charged' is only said when the refund was confirmed", async () => {
  const notCharged = /No se descontó de tu cuota/;
  const cases: Array<{ finish: () => Promise<FinishResult>; quota: unknown }> = [
    { finish: async () => ({ ...finished(7), updated: false }), quota: { remaining: 7, limit: 30, resets_at: resets } },
    { finish: async () => { throw new Error("Supabase colgado"); }, quota: null },
  ];
  for (const { finish, quota } of cases) {
    for (const timeout of [false, true]) {
      const budget = new AbortController();
      const result = await runWithQuota({
        reserve: async () => reserved,
        finish,
        call: async () => { if (timeout) budget.abort(); throw new Error("Groq no pudo responder."); },
        signal: budget.signal,
      });
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.equal(result.response.body.code, timeout ? "provider_timeout" : "provider_error");
      assert.doesNotMatch(result.response.body.detail, notCharged);
      assert.deepEqual(result.response.body.quota, quota);
    }
  }
});

test("the limit also cuts waits the client does not cancel (e.g. a stuck session refresh)", { timeout: 2_000 }, async () => {
  // Ignores the signal entirely, like supabase-js awaiting a token refresh before its fetch starts.
  const deafClient: QuotaRpcClient = { rpc: () => ({ abortSignal: () => new Promise(() => {}) }) };
  const started = Date.now();
  await assert.rejects(callQuotaRpc(deafClient, "pulso_ai_reserve", {}, AbortSignal.timeout(30)));
  assert.ok(Date.now() - started < 1_000);
  assert.equal(await readQuotaStatus(deafClient, 30), null);
});
