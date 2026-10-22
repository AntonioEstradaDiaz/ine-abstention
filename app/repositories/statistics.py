from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import DemographicParticipation, Election, ParticipationRecord, Territory


def observations(
    db: Session,
    *,
    territory_type: str = "state",
    year: int | None = None,
    state_code: str | None = None,
    through_year: int | None = None,
) -> list[dict]:
    statement = (
        select(
            Territory.id.label("territory_id"),
            Territory.territory_type,
            Territory.official_code,
            Territory.name,
            Territory.state_code,
            Territory.comparability_status,
            Election.year,
            Election.election_type,
            ParticipationRecord.source_id,
            ParticipationRecord.nominal_list,
            ParticipationRecord.voter_count,
            ParticipationRecord.nonvoter_count,
            ParticipationRecord.unspecified_count,
        )
        .select_from(ParticipationRecord)
        .join(Territory, Territory.id == ParticipationRecord.territory_id)
        .join(Election, Election.id == ParticipationRecord.election_id)
        .where(Territory.territory_type == territory_type)
    )
    if year is not None:
        statement = statement.where(Election.year == year)
    if state_code is not None:
        statement = statement.where(Territory.state_code == state_code)
    if through_year is not None:
        statement = statement.where(Election.year <= through_year)
    return [
        dict(row)
        for row in db.execute(statement.order_by(Election.year, Territory.official_code)).mappings()
    ]


def demographic_counts(
    db: Session, *, year: int, dimension: str, state_code: str | None = None
) -> list[dict]:
    # Solo entidades: sumar sus municipios también duplicaría la población.
    statement = (
        select(
            DemographicParticipation.category,
            *(
                func.sum(getattr(DemographicParticipation, key)).label(key)
                for key in (
                    "nominal_list",
                    "voter_count",
                    "nonvoter_count",
                    "unspecified_count",
                )
            ),
            func.count().label("territory_count"),
        )
        .join(Territory, Territory.id == DemographicParticipation.territory_id)
        .where(
            Territory.territory_type == "state",
            Territory.reference_year == year,
            DemographicParticipation.dimension == dimension,
        )
        .group_by(DemographicParticipation.category)
        .order_by(DemographicParticipation.category)
    )
    if state_code is not None:
        statement = statement.where(Territory.state_code == state_code)
    return [dict(row) for row in db.execute(statement).mappings()]
