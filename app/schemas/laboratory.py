from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Rate = Field(ge=0, le=1, allow_inf_nan=False)


class LaboratoryForecast(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    state_code: str = Field(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")
    name: str
    predicted: float = Rate
    lower: float = Rate
    upper: float = Rate
    risk_level: Literal["low", "medium", "high"]
    baseline_prediction: float = Rate
    delta_vs_baseline_pp: float
    uncertainty: dict[str, Any]
    features: dict[str, float | str | None]
    feature_source_years: list[int]

    @model_validator(mode="after")
    def ordered_band(self):
        if not self.lower <= self.predicted <= self.upper:
            raise ValueError("Banda inconsistente")
        return self


class LaboratoryModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    name: str
    label: str
    kind: Literal["ml", "baseline"]
    development_mae_pp: float = Field(ge=0)
    holdout_mae_pp: float = Field(ge=0)
    holdout_rmse_pp: float = Field(ge=0)
    selected_on_development: bool
    preferred_ml: bool
    calibration: dict[str, Any]
    important_features: list[dict[str, Any]]
    forecasts: list[LaboratoryForecast] = Field(min_length=32, max_length=32)


class LaboratoryReport(BaseModel):
    version: Literal["state-ml-laboratory-v1"]
    run_id: str = Field(pattern=r"^[a-f0-9]{20}$")
    created_at: str
    target_year: int
    as_of_year: int
    dataset_fingerprint: str
    implementation_fingerprint: str
    package_versions: dict[str, str]
    data: dict[str, Any]
    protocol: dict[str, Any]
    folds: list[dict[str, Any]]
    models: list[LaboratoryModel] = Field(min_length=6, max_length=6)
    limitations: list[str]
