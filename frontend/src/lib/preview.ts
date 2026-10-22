import snapshot from "./preview-data.json";
import type { Indicator, Predictions, Risk, ScenarioRates } from "./types";

const predictions = snapshot.predictions as Predictions;
const history = snapshot.history as Indicator[];
const thresholds = predictions.forecast.calibration.risk.thresholds;
const risk = (value: number): Risk =>
  value < thresholds[0] ? "low" : value < thresholds[1] ? "medium" : "high";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const page = <T>(items: T[]) => ({ total: items.length, items });
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Pulso-Mode": "preview" },
  });

// Explicit preview only: the production proxy never falls back to this snapshot.
export function previewResponse(
  resource: string,
  query: URLSearchParams,
  body?: string,
) {
  const year = Number(query.get("year") ?? 2021);
  switch (resource) {
    case "predictions":
      return json(predictions);
    case "elections":
      return json(
        [...new Set(history.map((r) => r.year))].sort().map((year) => ({
          id: year,
          year,
          election_type: history.find((r) => r.year === year)!.election_type,
        })),
      );
    case "statistics/territories":
      return json(page(history.filter((r) => r.year === year)));
    case "participation/history":
      return json(
        page(history.filter((r) => r.state_code === query.get("state_code"))),
      );
    case "data-sources":
      return json(snapshot.sources);
    case "models/metrics":
      return json(snapshot.metrics);
    case "statistics/summary": {
      const rows = history.filter((r) => r.year === year);
      if (!rows.length) return json({ items: [] });
      const sum = (
        key:
          | "voter_count"
          | "nonvoter_count"
          | "nominal_list"
          | "unspecified_count",
      ) => rows.reduce((s, r) => s + r[key], 0);
      const voter_count = sum("voter_count"),
        nonvoter_count = sum("nonvoter_count");
      const nominal_list = sum("nominal_list"),
        unspecified_count = sum("unspecified_count");
      return json({
        items: [
          {
            year,
            election_type: rows[0].election_type,
            voter_count,
            nonvoter_count,
            nominal_list,
            unspecified_count,
            participation_rate: voter_count / (voter_count + nonvoter_count),
            abstention_rate: nonvoter_count / (voter_count + nonvoter_count),
            unspecified_rate: unspecified_count / nominal_list,
            territory_count: rows.length,
            source_ids: [year],
          },
        ],
      });
    }
    case "simulations": {
      const input = JSON.parse(body ?? "null");
      if (
        !input ||
        !Number.isFinite(input.participation_change_pp) ||
        Math.abs(input.participation_change_pp) > 100 ||
        input.target_year !== 2027 ||
        input.forecast_run_id !== predictions.forecast.id ||
        !Array.isArray(input.state_codes) ||
        input.state_codes.length !== 1
      ) {
        return json({ detail: "Parámetros de vista previa inválidos." }, 422);
      }
      const p = predictions.items.find(
        (p) => p.state_code === input.state_codes[0],
      );
      if (!p) return json({ detail: "Estado no disponible." }, 422);
      const shift = input.participation_change_pp / 100;
      const rates = (
        point: number,
        lower: number,
        upper: number,
      ): ScenarioRates => {
        const possible: Risk[] = [
          risk(lower),
          ...(lower < thresholds[1] && upper >= thresholds[0]
            ? ["medium" as Risk]
            : []),
          risk(upper),
        ];
        const levels = [...new Set(possible)];
        return {
          abstention_rate: point,
          participation_rate: 1 - point,
          abstention_band_lower: lower,
          abstention_band_upper: upper,
          risk_level: risk(point),
          risk_levels_possible: levels,
          classification_uncertain: levels.length > 1,
        };
      };
      const point = clamp(p.predicted - shift),
        lower = clamp(p.lower - shift),
        upper = clamp(p.upper - shift);
      return json({
        id: `preview-no-guardado-${p.state_code}-${input.participation_change_pp}`,
        created_at: new Date().toISOString(),
        result: {
          forecast: predictions.forecast,
          parameters: {
            participation_change_pp: input.participation_change_pp,
            state_codes: input.state_codes,
          },
          assumptions: { preview: true, persisted: false, causal: false },
          summary: {
            selected_states: 1,
            aggregation: "single_state",
            national_electorate_estimate: false,
            states_with_risk_change: Number(risk(point) !== p.risk_level),
          },
          states: [
            {
              territory_id: p.territory_id,
              state_code: p.state_code,
              name: p.name,
              baseline: rates(p.predicted, p.lower, p.upper),
              scenario: rates(point, lower, upper),
              requested_participation_change_pp: input.participation_change_pp,
              applied_participation_change_pp: (p.predicted - point) * 100,
              risk_changed: risk(point) !== p.risk_level,
              point_was_clipped: point !== p.predicted - shift,
              band_was_clipped:
                lower !== p.lower - shift || upper !== p.upper - shift,
            },
          ],
        },
      });
    }
    default:
      return json({ detail: "Recurso no disponible en la vista previa." }, 404);
  }
}
