from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from sqlalchemy import func, select

from app.api.v1.predictions import Database
from app.db.models import Territory
from app.schemas.data import Page
from app.schemas.statistics import ElectionYear
from app.schemas.territories import TerritoryRead

router = APIRouter(prefix="/territories", tags=["territories"])


@router.get("", response_model=Page[TerritoryRead])
def territories(
    db: Database,
    territory_type: Literal["state", "municipality"] = "state",
    year: ElectionYear | None = None,
    state_code: Annotated[str | None, Query(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Catálogo por instantánea; omitir año selecciona el último disponible."""
    selected_year = year or db.scalar(
        select(Territory.reference_year)
        .where(Territory.territory_type == territory_type)
        .order_by(Territory.reference_year.desc())
        .limit(1)
    )
    query = select(Territory).where(
        Territory.territory_type == territory_type,
        Territory.reference_year == selected_year,
    )
    if state_code:
        query = query.where(Territory.state_code == state_code)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(Territory.official_code, Territory.id).limit(limit).offset(offset)
    ).all()
    return {"total": total, "limit": limit, "offset": offset, "items": rows}


@router.get("/{territory_id}", response_model=TerritoryRead)
def territory_detail(territory_id: Annotated[int, Path(ge=1)], db: Database):
    row = db.get(Territory, territory_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Territorio no encontrado")
    return row
