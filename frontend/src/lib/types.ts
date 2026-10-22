export type Risk = "low" | "medium" | "high";
export type ElectionType = "midterm" | "presidential";
export type Page<T> = { total: number; items: T[] };
export interface Election {
  id: number;
  year: number;
  election_type: ElectionType;
}
export interface Indicator {
  territory_id: number;
  territory_type: string;
  official_code: string;
  state_code?: string;
  name: string;
  year: number;
  election_type: ElectionType;
  source_id: number;
  nominal_list: number;
  voter_count: number;
  nonvoter_count: number;
  unspecified_count: number;
  participation_rate: number | null;
  abstention_rate: number | null;
  unspecified_rate: number | null;
  previous_comparable_year?: number | null;
  abstention_change_pp?: number | null;
  gap_vs_national_abstention_pp?: number | null;
  quality_notes?: string[];
}
export interface Forecast {
  id: string;
  target_year: number;
  as_of_year: number;
  election_type: ElectionType;
  created_at: string;
  calibration: {
    risk: { thresholds: number[]; [key: string]: unknown };
    uncertainty: { [key: string]: unknown };
  };
  provenance: {
    model_name: string;
    model_run_id: string;
    production_ready: boolean;
    [key: string]: unknown;
  };
}
export interface Prediction {
  territory_id: number;
  state_code: string;
  name: string;
  predicted: number;
  lower: number;
  upper: number;
  risk_level: Risk;
  uncertainty: {
    classification_uncertain: boolean;
    risk_levels_possible: Risk[];
    reference_quantile: number;
    radius: number;
    coverage_guaranteed: boolean;
    limitations: string[];
  };
  explanation: {
    method: string;
    causal: boolean;
    reference_year: number;
    source_id: number;
    voter_count: number;
    nonvoter_count: number;
    reference_unspecified_rate: number;
    context_only: {
      historical_mean_abstention: number;
      abstention_trend_pp_per_year: number;
      previous_gap_vs_national_pp: number;
      same_type_history_count: number;
    };
  };
  lineage: {
    feature_source_years: number[];
    publication_vintage_verified: boolean;
  };
}
export type Predictions = Page<Prediction> & { forecast: Forecast };
export interface Source {
  id: number;
  institution: string;
  dataset_name: string;
  year: number;
  source_url: string;
  landing_url: string;
}
export interface Summary {
  items: Array<
    Pick<
      Indicator,
      | "year"
      | "election_type"
      | "nominal_list"
      | "voter_count"
      | "nonvoter_count"
      | "unspecified_count"
      | "participation_rate"
      | "abstention_rate"
      | "unspecified_rate"
    > & { source_ids: number[]; territory_count: number }
  >;
}
export interface ModelMetrics {
  run_id: string;
  selected_on_development: string;
  models: Array<{
    model_name: string;
    version: string;
    status: string;
    created_at: string;
    metrics: {
      holdout_2024: { mae_pp: number; rmse_pp: number };
      development: { mae_pp?: number };
    };
  }>;
}
export interface ScenarioRates {
  abstention_rate: number;
  participation_rate: number;
  abstention_band_lower: number;
  abstention_band_upper: number;
  risk_level: Risk;
  risk_levels_possible: Risk[];
  classification_uncertain: boolean;
}
export interface StateSimulation {
  territory_id: number;
  state_code: string;
  name: string;
  baseline: ScenarioRates;
  scenario: ScenarioRates;
  requested_participation_change_pp: number;
  applied_participation_change_pp: number;
  risk_changed: boolean;
  point_was_clipped: boolean;
  band_was_clipped: boolean;
}
export interface Simulation {
  id: string;
  created_at: string;
  result: {
    forecast: Forecast;
    parameters: { participation_change_pp: number; state_codes: string[] };
    assumptions: Record<string, unknown>;
    summary: {
      selected_states: number;
      aggregation: string;
      national_electorate_estimate: false;
      states_with_risk_change: number;
    };
    states: StateSimulation[];
  };
}
