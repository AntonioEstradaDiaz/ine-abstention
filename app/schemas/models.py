from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ModelMetrics(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    model_name: str
    version: str
    status: Literal["development_selected", "candidate"]
    training_period: dict
    features: list[str]
    hyperparameters: dict
    metrics: dict
    artifact_manifest: dict
    created_at: datetime


class ModelMetricsResponse(BaseModel):
    run_id: str
    selected_on_development: str
    dataset_fingerprint: str
    implementation_fingerprint: str
    protocol: dict
    source_datasets: list[dict]
    package_versions: dict
    models: list[ModelMetrics]
    error_unit: str = "percentage_points"
