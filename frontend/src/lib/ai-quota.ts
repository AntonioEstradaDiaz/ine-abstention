// AI quota rules shared by the assistant route. Pure module: no Next.js or Supabase imports,
// so it runs under `node --test`. Spanish copy here is the single source for quota messages.

/** Total time a single assistant request may take, data lookup included. */
export const AI_BUDGET_MS = 45_000;
export const AI_QUOTA_TIME_ZONE = "America/Mexico_City";

export type QuotaLimitCode = "daily_limit" | "rate_limit" | "global_limit";
export type QuotaErrorCode =
  | QuotaLimitCode
  | "quota_unavailable"
  | "provider_error"
  | "provider_timeout";

export interface QuotaInfo {
  remaining: number;
  limit: number;
  resets_at: string;
}

/** Result of the `pulso_ai_reserve` RPC. */
export type ReserveResult =
  | ({ ok: true; reservation_id: string } & QuotaInfo)
  | ({ ok: false; code: QuotaLimitCode; retry_after_seconds?: number } & QuotaInfo);

/** Result of the `pulso_ai_finish` RPC. */
export interface FinishResult extends QuotaInfo {
  updated: boolean;
  global_exhausted?: boolean;
}

export interface QuotaErrorBody {
  detail: string;
  code: QuotaErrorCode;
  retry_after_seconds?: number;
  resets_at?: string;
  quota?: QuotaInfo | null;
}

export interface QuotaErrorResponse {
  status: number;
  body: QuotaErrorBody;
  headers: Record<string, string>;
}

const resetFormat = new Intl.DateTimeFormat("es-MX", {
  timeZone: AI_QUOTA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "00:00" for the reset instant, in Mexico City time; null if the value is not a date. */
export function formatResetTime(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : resetFormat.format(date);
}

/** Counter shown next to the assistant, e.g. "Te quedan 29 de 30 consultas hoy · …". */
export function quotaSummary({ remaining, limit, resets_at }: QuotaInfo): string {
  const reset = `se reinician a las ${formatResetTime(resets_at) ?? "00:00"} (hora del centro)`;
  if (remaining <= 0) return `Usaste tus ${limit} consultas de hoy · ${reset}`;
  return `${remaining === 1 ? "Te queda" : "Te quedan"} ${remaining} de ${limit} consultas hoy · ${reset}`;
}

const quotaInfo = ({ remaining, limit, resets_at }: QuotaInfo): QuotaInfo => ({
  remaining,
  limit,
  resets_at,
});

export function quotaErrorResponse(
  code: QuotaErrorCode,
  options: {
    limit?: number;
    resetsAt?: string;
    retryAfterSeconds?: number;
    providerMessage?: string;
    quota?: QuotaInfo | null;
  } = {},
): QuotaErrorResponse {
  const at = `${(options.resetsAt && formatResetTime(options.resetsAt)) ?? "00:00"} (hora del centro de México)`;
  const seconds = Math.max(1, Math.ceil(options.retryAfterSeconds ?? 60));
  const notCharged = "No se descontó de tu cuota.";
  const copy: Record<QuotaErrorCode, [number, string]> = {
    daily_limit: [429, `Usaste tus ${options.limit ?? 30} consultas de hoy. Se reinician a las ${at}.`],
    rate_limit: [429, `Vas muy rápido: espera ${seconds} ${seconds === 1 ? "segundo" : "segundos"} antes de volver a preguntar.`],
    global_limit: [429, `El asistente alcanzó su límite diario para todos los usuarios. Vuelve después de las ${at}.`],
    quota_unavailable: [503, "No pudimos verificar tu cuota. El asistente no está disponible por ahora."],
    provider_error: [502, `${options.providerMessage ?? "La IA no pudo responder."} ${notCharged}`],
    provider_timeout: [504, `La IA tardó más de ${AI_BUDGET_MS / 1000} segundos. ${notCharged}`],
  };
  const [status, detail] = copy[code];
  const body: QuotaErrorBody = { detail, code };
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (code === "rate_limit") {
    body.retry_after_seconds = seconds;
    headers["Retry-After"] = String(seconds);
  }
  if ((code === "daily_limit" || code === "global_limit") && options.resetsAt)
    body.resets_at = options.resetsAt;
  if (options.quota !== undefined) body.quota = options.quota;
  return { status, body, headers };
}

/** Limits for quota RPCs that run outside the request budget (design TD-005). */
export const QUOTA_FINISH_TIMEOUT_MS = 5_000;
export const QUOTA_STATUS_TIMEOUT_MS = 3_000;

/** The part of the Supabase client used for quota RPCs; a structural type keeps this module testable. */
export interface QuotaRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

/** Calls a quota RPC, cut off by `signal`; throws on any error, empty data or cancellation. */
export async function callQuotaRpc<T>(
  client: QuotaRpcClient | null,
  fn: string,
  args: Record<string, unknown> | undefined,
  signal: AbortSignal,
): Promise<T> {
  if (!client) throw new Error("Autenticación sin configurar");
  signal.throwIfAborted();
  const { data, error } = await client.rpc(fn, args).abortSignal(signal);
  if (signal.aborted || error || data == null) throw new Error("Cuota no disponible");
  return data as T;
}

/**
 * Reserve and finish bound to one request. Reserving shares the request budget; finishing gets
 * its own short limit so a slot can still be released after the budget has run out.
 */
export function quotaRpcs(
  client: QuotaRpcClient | null,
  secret: () => string,
  budget: AbortSignal,
  finishTimeoutMs = QUOTA_FINISH_TIMEOUT_MS,
) {
  return {
    reserve: () =>
      callQuotaRpc<ReserveResult>(client, "pulso_ai_reserve", { p_secret: secret() }, budget),
    finish: (reservationId: string, succeeded: boolean) =>
      callQuotaRpc<FinishResult>(
        client,
        "pulso_ai_finish",
        { p_secret: secret(), p_reservation: reservationId, p_succeeded: succeeded },
        AbortSignal.timeout(finishTimeoutMs),
      ),
  };
}

/** Remaining quota for the signed-in account, or null if it cannot be read in time. */
export async function readQuotaStatus(
  client: QuotaRpcClient | null,
  timeoutMs = QUOTA_STATUS_TIMEOUT_MS,
): Promise<QuotaInfo | null> {
  try {
    return quotaInfo(
      await callQuotaRpc<QuotaInfo>(client, "pulso_ai_quota_status", undefined, AbortSignal.timeout(timeoutMs)),
    );
  } catch {
    return null;
  }
}

export type QuotaOutcome<T> =
  | { ok: true; value: T; quota: QuotaInfo }
  | { ok: false; response: QuotaErrorResponse };

/**
 * Reserve a quota slot, call the provider, then confirm or release the slot.
 * Rejected or unverifiable reservations never reach the provider (fail closed).
 * `signal` is the request's total time budget; if it fires, the outcome is a timeout.
 */
export async function runWithQuota<T>({
  reserve,
  finish,
  call,
  signal,
}: {
  reserve: () => Promise<ReserveResult>;
  finish: (reservationId: string, succeeded: boolean) => Promise<FinishResult>;
  call: (signal: AbortSignal) => Promise<T>;
  signal: AbortSignal;
}): Promise<QuotaOutcome<T>> {
  if (signal.aborted)
    return { ok: false, response: quotaErrorResponse("provider_timeout") };
  let reservation: ReserveResult;
  try {
    reservation = await reserve();
  } catch {
    return { ok: false, response: quotaErrorResponse("quota_unavailable") };
  }
  if (!reservation.ok)
    return {
      ok: false,
      response: quotaErrorResponse(reservation.code, {
        limit: reservation.limit,
        resetsAt: reservation.resets_at,
        retryAfterSeconds: reservation.retry_after_seconds,
        quota: quotaInfo(reservation),
      }),
    };
  const id = reservation.reservation_id;
  // A failed confirmation leaves the slot counted (conservative); the user still gets the answer.
  const settle = (succeeded: boolean) =>
    Promise.resolve()
      .then(() => finish(id, succeeded))
      .then(quotaInfo, () => null);
  try {
    const value = await call(signal);
    return { ok: true, value, quota: (await settle(true)) ?? quotaInfo(reservation) };
  } catch (error) {
    const quota = await settle(false);
    return {
      ok: false,
      response: signal.aborted
        ? quotaErrorResponse("provider_timeout", { quota })
        : quotaErrorResponse("provider_error", {
            providerMessage: error instanceof Error ? error.message : undefined,
            quota,
          }),
    };
  }
}
