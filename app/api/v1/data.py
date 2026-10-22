from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.db.models import DataSource, Election, ParticipationRecord, Territory
from app.schemas.data import DataSourceRead, ElectionRead, HistoryPage, Page

router = APIRouter(tags=["official-data"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/data-sources", response_model=Page[DataSourceRead])
def data_sources(
    db: DB,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return {
        "total": db.scalar(select(func.count()).select_from(DataSource)),
        "limit": limit,
        "offset": offset,
        "items": db.scalars(
            select(DataSource).order_by(DataSource.year).limit(limit).offset(offset)
        ).all(),
    }


@router.get("/elections", response_model=list[ElectionRead])
def elections(db: DB):
    return db.scalars(select(Election).order_by(Election.year)).all()


@router.get("/participation/history", response_model=HistoryPage)
def history(
    db: DB,
    territory_type: Literal["state", "municipality"] = "state",
    year: Annotated[int | None, Query(ge=2009, le=2024)] = None,
    state_code: Annotated[str | None, Query(pattern=r"^(0[1-9]|[12][0-9]|3[0-2])$")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Histórico por instantánea territorial; no implica homologación municipal."""
    filters = [Territory.territory_type == territory_type]
    if year is not None:
        filters.append(Election.year == year)
    if state_code is not None:
        filters.append(Territory.state_code == state_code)
    base = (
        select(
            Territory.id.label("territory_id"),
            Territory.territory_type,
            Territory.official_code,
            Territory.name,
            Territory.comparability_status,
            Election.year,
            Election.election_type,
            ParticipationRecord.nominal_list,
            ParticipationRecord.voter_count,
            ParticipationRecord.nonvoter_count,
            ParticipationRecord.unspecified_count,
            ParticipationRecord.participation_rate,
            ParticipationRecord.abstention_rate,
            ParticipationRecord.unspecified_rate,
            ParticipationRecord.source_id,
        )
        .select_from(ParticipationRecord)
        .join(Territory, Territory.id == ParticipationRecord.territory_id)
        .join(Election, Election.id == ParticipationRecord.election_id)
        .where(*filters)
    )
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = (
        db.execute(
            base.order_by(Election.year, Territory.official_code).limit(limit).offset(offset)
        )
        .mappings()
        .all()
    )
    return {"total": total, "limit": limit, "offset": offset, "items": items}
