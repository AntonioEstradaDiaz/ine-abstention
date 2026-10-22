from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import ForecastRun, TerritorialPrediction
from app.schemas.predictions import (
    ForecastRunRead,
    PredictionDetail,
    PredictionPage,
    RiskLevel,
    RiskSummary,
)
from app.schemas.territories import RiskMap

router = APIRouter(tags=["predictions"])
Database = Annotated[Session, Depends(get_db)]


def resolve_forecast(
    db: Database,
    target_year: Annotated[int | None, Query(ge=2025, le=2100)] = None,
    run_id: Annotated[str | None, Query(pattern=r"^[a-f0-9]{20}$")] = None,
) -> ForecastRun:
    query = select(ForecastRun)
    if run_id:
        query = query.where(ForecastRun.id == run_id)
    if target_year is not None or run_id is None:
        query = query.where(ForecastRun.target_year == (target_year or 2027))
    run = db.scalar(query.order_by(ForecastRun.created_at.desc(), ForecastRun.id.desc()).limit(1))
    if run is None:
        raise HTTPException(status_code=404, detail="Escenario de predicción no generado")
    return run


SelectedForecast = Annotated[ForecastRun, Depends(resolve_forecast)]


@router.get("/risk/map", response_model=RiskMap)
def risk_map(
    db: Database,
    forecast: SelectedForecast,
    state_code: Annotated[str | None, Query(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")] = None,
):
    """GeoJSON con geometría nula hasta incorporar cartografía estatal verificada."""
    query = select(TerritorialPrediction).where(
        TerritorialPrediction.forecast_run_id == forecast.id
    )
    if state_code:
        query = query.where(TerritorialPrediction.state_code == state_code)
    rows = db.scalars(query.order_by(TerritorialPrediction.state_code)).all()
    return {
        "forecast_run_id": forecast.id,
        "target_year": forecast.target_year,
        "notes": [
            "No verified geometry available; join an official layer by two-digit state_code",
            "Municipal forecasts require temporal crosswalks",
        ],
        "features": [
            {
                "id": p.territory_id,
                "geometry": None,
                "properties": {
                    "state_code": p.state_code,
                    "name": p.name,
                    "abstention_rate": p.predicted,
                    "lower": p.lower,
                    "upper": p.upper,
                    "risk_level": p.risk_level,
                    "classification_uncertain": p.uncertainty["classification_uncertain"],
                },
            }
            for p in rows
        ],
    }


@router.get("/predictions", response_model=PredictionPage)
def predictions(
    db: Database,
    forecast: SelectedForecast,
    state_code: Annotated[str | None, Query(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")] = None,
    risk_level: RiskLevel | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 32,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Resultados estatales materializados. Las tasas son fracciones, no porcentajes."""
    query = select(TerritorialPrediction).where(
        TerritorialPrediction.forecast_run_id == forecast.id
    )
    if state_code:
        query = query.where(TerritorialPrediction.state_code == state_code)
    if risk_level:
        query = query.where(TerritorialPrediction.risk_level == risk_level)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(TerritorialPrediction.state_code).limit(limit).offset(offset)
    ).all()
    return {"forecast": forecast, "total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/predictions/{territory_id}", response_model=PredictionDetail)
def prediction_detail(
    territory_id: Annotated[int, Path(ge=1)],
    db: Database,
    forecast: SelectedForecast,
):
    prediction = db.scalar(
        select(TerritorialPrediction).where(
            TerritorialPrediction.forecast_run_id == forecast.id,
            TerritorialPrediction.territory_id == territory_id,
        )
    )
    if prediction is None:
        raise HTTPException(status_code=404, detail="Territorio sin predicción en este escenario")
    return {"forecast": forecast, "prediction": prediction}


@router.get("/risk/calibration", response_model=ForecastRunRead)
def risk_calibration(forecast: SelectedForecast):
    """Umbrales, residuos, cortes cronológicos y límites de interpretación."""
    return forecast


@router.get("/risk/summary", response_model=RiskSummary)
def risk_summary(db: Database, forecast: SelectedForecast):
    rows = db.scalars(
        select(TerritorialPrediction).where(
            TerritorialPrediction.forecast_run_id == forecast.id,
        )
    ).all()
    return {
        "forecast": forecast,
        "total_states": len(rows),
        "counts": {
            level: sum(r.risk_level == level for r in rows) for level in ("low", "medium", "high")
        },
        "uncertain_classifications": sum(r.uncertainty["classification_uncertain"] for r in rows),
    }
