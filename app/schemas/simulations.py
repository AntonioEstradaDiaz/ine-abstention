from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.predictions import ForecastRunRead, Rate, RiskLevel

StateCode = Annotated[str, Field(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")]
ChangePP = Annotated[float, Field(strict=True, ge=-100, le=100, allow_inf_nan=False)]


class StateChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state_code: StateCode
    participation_change_pp: ChangePP


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="Escenario hipotético", min_length=1, max_length=120)
    forecast_run_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{20}$")
    target_year: int | None = Field(default=None, ge=2025, le=2100)
    state_codes: list[StateCode] | None = Field(default=None, min_length=1, max_length=32)
    participation_change_pp: ChangePP = Field(
        description="Cambio absoluto supuesto; +3 aumenta participación tres puntos porcentuales"
    )
    state_changes: list[StateChange] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def unique_and_scoped(self) -> Self:
        if self.state_codes is not None and len(set(self.state_codes)) != len(self.state_codes):
            raise ValueError("state_codes contiene entidades duplicadas")
        codes = [change.state_code for change in self.state_changes]
        if len(set(codes)) != len(codes):
            raise ValueError("state_changes contiene entidades duplicadas")
        if self.state_codes is not None and not set(codes) <= set(self.state_codes):
            raise ValueError("Los cambios por entidad deben pertenecer al alcance seleccionado")
        return self


class ScenarioRates(BaseModel):
    abstention_rate: Rate
    participation_rate: Rate
    abstention_band_lower: Rate
    abstention_band_upper: Rate
    participation_band_lower: Rate
    participation_band_upper: Rate
    risk_level: RiskLevel
    risk_levels_possible: list[RiskLevel]
    classification_uncertain: bool


class StateSimulation(BaseModel):
    territory_id: int
    state_code: StateCode
    name: str
    baseline: ScenarioRates
    scenario: ScenarioRates
    requested_participation_change_pp: ChangePP
    applied_participation_change_pp: ChangePP
    applied_abstention_change_pp: ChangePP
    point_was_clipped: bool
    band_was_clipped: bool
    risk_changed: bool


class ScenarioAggregate(BaseModel):
    mean_abstention_rate: Rate
    mean_participation_rate: Rate
    risk_counts: dict[RiskLevel, int]
    uncertain_classifications: int


class SimulationSummary(BaseModel):
    selected_states: int
    aggregation: Literal["unweighted_mean_of_selected_states"]
    national_electorate_estimate: Literal[False]
    baseline: ScenarioAggregate
    scenario: ScenarioAggregate
    mean_applied_participation_change_pp: ChangePP
    states_with_risk_change: int
    states_with_clipped_point: int
    states_with_clipped_band: int
    aggregate_prediction_interval: None


class SimulationResult(BaseModel):
    engine_version: str
    implementation_sha256: str
    forecast: ForecastRunRead
    parameters: SimulationRequest
    assumptions: dict
    summary: SimulationSummary
    states: list[StateSimulation]


class SimulationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    result: SimulationResult


class SimulationListItem(BaseModel):
    id: str
    forecast_run_id: str
    name: str
    created_at: datetime
