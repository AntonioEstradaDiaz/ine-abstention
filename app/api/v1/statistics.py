from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories.statistics import demographic_counts, observations
from app.schemas.statistics import (
    DemographicResponse,
    ElectionKind,
    ElectionYear,
    SummaryResponse,
    TerritoryStatisticsResponse,
    TrendsResponse,
)
from app.services.statistics_service import (
    StatisticsConflict,
    StatisticsNotFound,
    rates,
    summary,
    territory_indicators,
    trends,
)

router = APIRouter(prefix="/statistics", tags=["statistics"])
DB = Annotated[Session, Depends(get_db)]
StateCode = Annotated[str | None, Query(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")]


def respond(operation, *args, **kwargs):
    try:
        return operation(*args, **kwargs)
    except StatisticsNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except StatisticsConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None


@router.get("/summary", response_model=SummaryResponse)
def statistical_summary(db: DB, year: ElectionYear | None = None, state_code: StateCode = None):
    """Suma de conteos antes de calcular tasas; cambios frente al mismo tipo electoral."""
    return respond(
        summary,
        observations(db, state_code=state_code, through_year=year),
        year=year,
        state_code=state_code,
    )


@router.get("/trends", response_model=TrendsResponse)
def historical_trends(
    db: DB,
    state_code: StateCode = None,
    election_type: ElectionKind | None = None,
    through_year: ElectionYear | None = None,
):
    """Tendencias descriptivas separadas para elecciones presidenciales e intermedias."""
    return respond(
        trends,
        observations(db, state_code=state_code, through_year=through_year),
        state_code=state_code,
        election_type=election_type,
        through_year=through_year,
    )


@router.get("/territories", response_model=TerritoryStatisticsResponse)
def territorial_statistics(
    db: DB,
    year: ElectionYear | None = None,
    territory_type: Literal["state", "municipality"] = "state",
    state_code: StateCode = None,
    sort_by: Literal[
        "abstention_desc", "participation_desc", "abstention_change_desc", "trend_desc"
    ] = "abstention_desc",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Indicadores y comparaciones; municipios limitados a instantáneas de cada año."""
    if territory_type == "municipality" and sort_by in ("abstention_change_desc", "trend_desc"):
        raise HTTPException(
            status_code=409, detail="La tendencia municipal requiere homologación temporal"
        )
    states = observations(db)
    if not states:
        raise HTTPException(status_code=404, detail="No hay observaciones cargadas")
    selected_year = year if year is not None else max(row["year"] for row in states)
    if territory_type == "state":
        snapshots = [
            row
            for row in states
            if row["year"] == selected_year
            and (state_code is None or row["state_code"] == state_code)
        ]
    else:
        snapshots = observations(
            db, territory_type="municipality", year=selected_year, state_code=state_code
        )
    if not snapshots:
        raise HTTPException(
            status_code=404, detail="No hay territorios para los filtros solicitados"
        )
    items = respond(territory_indicators, states, snapshots, year=selected_year)
    field = {
        "abstention_desc": "abstention_rate",
        "participation_desc": "participation_rate",
        "abstention_change_desc": "abstention_change_pp",
    }.get(sort_by)

    def order(item):
        value = item[field] if field else item["history"]["abstention_slope_pp_per_year"]
        return (value is None, -value if value is not None else 0, item["official_code"])

    items.sort(key=order)
    return {
        "year": selected_year,
        "territory_type": territory_type,
        "sort_by": sort_by,
        "total": len(items),
        "limit": limit,
        "offset": offset,
        "items": items[offset : offset + limit],
    }


@router.get("/demographics", response_model=DemographicResponse)
def demographic_statistics(
    db: DB,
    dimension: Literal["sex", "age_band", "section_type"],
    year: ElectionYear | None = None,
    state_code: StateCode = None,
):
    """Una dimensión por consulta: no sumar márgenes de sexo, edad y sección entre sí."""
    states = observations(db)
    if not states:
        raise HTTPException(status_code=404, detail="No hay observaciones cargadas")
    selected_year = year if year is not None else max(row["year"] for row in states)
    reference = respond(summary, states, year=selected_year, state_code=state_code)["items"][0]
    rows = demographic_counts(db, year=selected_year, dimension=dimension, state_code=state_code)
    if not rows:
        raise HTTPException(status_code=404, detail="No hay desgloses para los filtros solicitados")
    return {
        "scope": "state" if state_code else "national",
        "state_code": state_code,
        "year": selected_year,
        "dimension": dimension,
        "source_ids": reference["source_ids"],
        "notes": ["separate_marginal_distribution_not_cross_tabulation"],
        "items": [{**row, **rates(row)} for row in rows],
    }
