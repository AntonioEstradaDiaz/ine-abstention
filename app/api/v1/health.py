import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger(__name__)


@router.get("")
def health() -> dict[str, str]:
    """Comprobar que el proceso de API responde, sin consultar la base."""
    return {"status": "ok"}


@router.get("/metrics")
def metrics(request: Request) -> dict:
    """Per-worker counters for internal monitoring, protected by the API token in production."""
    return request.app.state.telemetry.snapshot()


@router.get("/ready")
def readiness(db: Annotated[Session, Depends(get_db)]) -> dict[str, str]:
    """Verificar conexión a PostgreSQL y disponibilidad de PostGIS."""
    try:
        version = db.execute(text("SELECT PostGIS_Version()")).scalar_one()
        schema = get_settings().database_schema
        tables = (
            "territories",
            "participation_records",
            "model_versions",
            "forecast_runs",
            "simulation_runs",
        )
        conditions = " AND ".join(f"to_regclass(:t{i}) IS NOT NULL" for i in range(len(tables)))
        schema_ready = db.execute(
            text("SELECT " + conditions),
            {f"t{i}": f"{schema}.{table}" for i, table in enumerate(tables)},
        ).scalar_one()
    except SQLAlchemyError:
        logger.warning("database_readiness_failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    if not schema_ready:
        raise HTTPException(status_code=503, detail="Database schema unavailable")
    return {"status": "ok", "database": "ok", "postgis_version": str(version)}
