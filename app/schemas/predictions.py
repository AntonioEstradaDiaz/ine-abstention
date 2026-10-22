from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.data import Page

Rate = Annotated[float, Field(ge=0, le=1)]
RiskLevel = Literal["low", "medium", "high"]


class ForecastRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    model_version_id: int
    target_year: int
    as_of_year: int
    election_type: Literal["midterm", "presidential"]
    fingerprint: str
    calibration: dict
    provenance: dict
    created_at: datetime


class UncertaintyRead(BaseModel):
    method: str
    reference_quantile: Rate
    radius: Rate | None
    calibration_years: list[int]
    calibration_rows: int
    election_blocks: int
    coverage_guaranteed: Literal[False]
    support: Literal["limited", "insufficient"]
    limitations: list[str]
    risk_levels_possible: list[RiskLevel]
    classification_uncertain: bool
    high_risk_probability: None


class PredictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    territory_id: int
    state_code: str
    name: str
    predicted: Rate = Field(description="Abstención prevista NV/(SV+NV), fracción; NS excluidos")
    lower: Rate = Field(description="Extremo inferior de banda empírica; cobertura no garantizada")
    upper: Rate
    risk_level: RiskLevel
    uncertainty: UncertaintyRead
    explanation: dict
    lineage: dict


class PredictionPage(Page[PredictionRead]):
    forecast: ForecastRunRead


class PredictionDetail(BaseModel):
    forecast: ForecastRunRead
    prediction: PredictionRead


class RiskSummary(BaseModel):
    forecast: ForecastRunRead
    total_states: int
    counts: dict[RiskLevel, int]
    uncertain_classifications: int
