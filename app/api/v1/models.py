from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import ModelVersion
from app.schemas.models import ModelMetricsResponse

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/metrics", response_model=ModelMetricsResponse)
def model_metrics(
    db: Annotated[Session, Depends(get_db)],
    run_id: Annotated[str | None, Query(pattern=r"^[a-f0-9]{20}$")] = None,
):
    """Comparaciones registradas; no cargar ni ejecutar archivos de pesos desde la API."""
    selected_run = run_id or db.scalar(
        select(ModelVersion.run_id)
        .order_by(ModelVersion.created_at.desc(), ModelVersion.id.desc())
        .limit(1)
    )
    if selected_run is None:
        raise HTTPException(status_code=404, detail="No hay experimentos entrenados registrados")
    models = db.scalars(
        select(ModelVersion)
        .where(ModelVersion.run_id == selected_run)
        .order_by(ModelVersion.model_name)
    ).all()
    if not models:
        raise HTTPException(status_code=404, detail="Experimento no encontrado")
    winners = [m.model_name for m in models if m.status == "development_selected"]
    if len(winners) != 1:
        raise HTTPException(status_code=409, detail="Selección de desarrollo inconsistente")
    first = models[0]
    return {
        "run_id": selected_run,
        "selected_on_development": winners[0],
        "dataset_fingerprint": first.dataset_fingerprint,
        "implementation_fingerprint": first.implementation_fingerprint,
        "protocol": first.protocol,
        "source_datasets": first.source_datasets,
        "package_versions": first.package_versions,
        "models": models,
    }
