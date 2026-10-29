import type { Forecast } from "./types";

type AuditIdentity = {
  forecast_run_id: string;
  training_run_id: string;
  selected_model: string;
  unseen_holdout_year: number;
  calibration: {
    year: number;
    type: string;
    reference_radius_pp: number;
    reference_years: number[];
    independent_election_blocks: number;
    coverage_guaranteed: boolean;
  };
};

// Frozen audit evidence belongs to one forecast, not every use of its model.
export function matchesForecastAudit(forecast: Forecast, audit: AuditIdentity): boolean {
  const uncertainty = forecast.calibration.uncertainty;
  const years = uncertainty.calibration_years;
  const radius = uncertainty.radius;
  return forecast.id === audit.forecast_run_id &&
    forecast.provenance.model_run_id === audit.training_run_id &&
    forecast.provenance.model_name === audit.selected_model &&
    forecast.provenance.mode !== "preview" &&
    forecast.as_of_year === audit.unseen_holdout_year &&
    forecast.target_year === audit.calibration.year &&
    forecast.election_type === audit.calibration.type &&
    typeof radius === "number" && Number.isFinite(radius) &&
    Math.abs(radius * 100 - audit.calibration.reference_radius_pp) <= 0.000001 &&
    uncertainty.election_blocks === audit.calibration.independent_election_blocks &&
    uncertainty.coverage_guaranteed === audit.calibration.coverage_guaranteed &&
    Array.isArray(years) && years.length === audit.calibration.reference_years.length &&
    years.every((year, index) => year === audit.calibration.reference_years[index]);
}
