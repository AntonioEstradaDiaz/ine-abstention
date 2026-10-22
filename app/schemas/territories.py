from typing import Literal

from pydantic import BaseModel, ConfigDict


class TerritoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: int
    territory_type: Literal["state", "municipality"]
    official_code: str
    state_code: str
    municipality_code: str | None
    name: str
    reference_year: int
    parent_id: int | None
    cartography_reference: str
    comparability_status: str


class RiskFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int
    geometry: None
    properties: dict


class RiskMap(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    forecast_run_id: str
    target_year: int
    geometry_status: Literal["unavailable"] = "unavailable"
    join_key: str = "properties.state_code"
    notes: list[str]
    features: list[RiskFeature]
