from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.v1.predictions import Database, resolve_forecast
from app.db.models import SimulationRun, TerritorialPrediction
from app.schemas.data import Page
from app.schemas.predictions import ForecastRunRead, PredictionRead
from app.schemas.simulations import SimulationListItem, SimulationRead, SimulationRequest
from app.services.simulation_service import simulate

router = APIRouter(prefix="/simulations", tags=["simulations"])


@router.post(
    "",
    response_model=SimulationRead,
    status_code=201,
    responses={200: {"description": "Escenario ya registrado"}},
)
def create_simulation(payload: SimulationRequest, db: Database, response: Response):
    """Comparar base y supuesto aritmético, guardar y devolver sus parámetros y resultados."""
    forecast = resolve_forecast(db, target_year=payload.target_year, run_id=payload.forecast_run_id)
    query = select(TerritorialPrediction).where(
        TerritorialPrediction.forecast_run_id == forecast.id
    )
    if payload.state_codes is not None:
        query = query.where(TerritorialPrediction.state_code.in_(payload.state_codes))
    predictions = [PredictionRead.model_validate(p) for p in db.scalars(query).all()]
    available = {p.state_code for p in predictions}
    if payload.state_codes is None and available != {f"{i:02}" for i in range(1, 33)}:
        raise HTTPException(
            status_code=409, detail="El escenario base no contiene las 32 entidades"
        )
    requested = set(payload.state_codes or ()) | {c.state_code for c in payload.state_changes}
    if not predictions or not requested <= available:
        raise HTTPException(
            status_code=404, detail="Entidades sin predicción para el escenario base"
        )
    simulation_id, result = simulate(payload, ForecastRunRead.model_validate(forecast), predictions)
    created = db.scalar(
        insert(SimulationRun)
        .values(
            id=simulation_id,
            forecast_run_id=forecast.id,
            name=payload.name,
            result=result,
        )
        .on_conflict_do_nothing(index_elements=["id"])
        .returning(SimulationRun.id)
    )
    db.commit()
    stored = db.get(SimulationRun, simulation_id)
    response.status_code = 201 if created else 200
    response.headers["Location"] = f"/api/v1/simulations/{simulation_id}"
    return stored


@router.get("", response_model=Page[SimulationListItem])
def simulations(
    db: Database,
    forecast_run_id: Annotated[str | None, Query(pattern=r"^[a-f0-9]{20}$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(
        SimulationRun.id,
        SimulationRun.forecast_run_id,
        SimulationRun.name,
        SimulationRun.created_at,
    )
    if forecast_run_id:
        query = query.where(SimulationRun.forecast_run_id == forecast_run_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        db.execute(
            query.order_by(SimulationRun.created_at.desc(), SimulationRun.id)
            .limit(limit)
            .offset(offset)
        )
        .mappings()
        .all()
    )
    return {"total": total, "limit": limit, "offset": offset, "items": rows}


@router.get("/{simulation_id}", response_model=SimulationRead)
def simulation_detail(
    simulation_id: Annotated[str, Path(pattern=r"^[a-f0-9]{64}$")],
    db: Database,
):
    stored = db.get(SimulationRun, simulation_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Simulación no encontrada")
    return stored
