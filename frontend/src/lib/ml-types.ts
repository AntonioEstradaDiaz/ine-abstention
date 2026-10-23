import type { Risk } from "./types";

export interface MLForecast {
  state_code: string;
  name: string;
  predicted: number;
  lower: number;
  upper: number;
  risk_level: Risk;
  baseline_prediction: number;
  delta_vs_baseline_pp: number;
  uncertainty: {
    classification_uncertain: boolean;
    risk_levels_possible: Risk[];
  };
  features: Record<string, number | string | null>;
  feature_source_years: number[];
}
export interface MLModel {
  name: string;
  label: string;
  kind: "ml" | "baseline";
  development_mae_pp: number;
  holdout_mae_pp: number;
  holdout_rmse_pp: number;
  selected_on_development: boolean;
  preferred_ml: boolean;
  calibration: {
    risk: { thresholds: number[] };
    uncertainty: {
      calibration_years: number[];
      radius: number;
      coverage_guaranteed: boolean;
    };
  };
  important_features: Array<{
    feature: string;
    label: string;
    weight: number;
    method: string;
  }>;
  forecasts: MLForecast[];
}
export interface MLLaboratory {
  version: string;
  run_id: string;
  created_at: string;
  target_year: number;
  as_of_year: number;
  dataset_fingerprint: string;
  package_versions: Record<string, string>;
  data: {
    source: string;
    source_sha256: string;
    rows: number;
    state_count: number;
    years: number[];
    supervised_rows: number;
    demographics_available: boolean;
  };
  protocol: {
    development_years: number[];
    final_holdout_year: number;
    preferred_ml_model: string;
    selected_model: string;
    production_ready: boolean;
  };
  folds: Array<{
    test_year: number;
    train_target_years: number[];
    train_rows: number;
    test_rows: number;
  }>;
  models: MLModel[];
  limitations: string[];
}
