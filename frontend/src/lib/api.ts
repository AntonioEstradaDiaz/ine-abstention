import type {
  Election,
  Indicator,
  ModelMetrics,
  Page,
  Predictions,
  Simulation,
  Source,
  Summary,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
async function request<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    signal,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : "No se pudo completar la consulta. Intenta nuevamente.";
    throw new ApiError(response.status, detail);
  }
  return data as T;
}
export const api = {
  elections: (signal?: AbortSignal) => request<Election[]>("elections", signal),
  predictions: (signal?: AbortSignal) =>
    request<Predictions>("predictions?target_year=2027&limit=100", signal),
  indicators: (year: number, signal?: AbortSignal) =>
    request<Page<Indicator>>(
      `statistics/territories?year=${year}&territory_type=state&limit=100`,
      signal,
    ),
  summary: (year: number, signal?: AbortSignal) =>
    request<Summary>(`statistics/summary?year=${year}`, signal),
  history: (state: string, signal?: AbortSignal) =>
    request<Page<Indicator>>(
      `participation/history?territory_type=state&state_code=${state}&limit=100`,
      signal,
    ),
  sources: (signal?: AbortSignal) =>
    request<Page<Source>>("data-sources?limit=100", signal),
  metrics: (run: string, signal?: AbortSignal) =>
    request<ModelMetrics>(
      `models/metrics?run_id=${encodeURIComponent(run)}`,
      signal,
    ),
  simulate: (state: string, change: number, run: string) =>
    request<Simulation>("simulations", undefined, {
      name: `Escenario ${state}: ${change > 0 ? "+" : ""}${change} pp`,
      state_codes: [state],
      participation_change_pp: change,
      target_year: 2027,
      forecast_run_id: run,
    }),
};
