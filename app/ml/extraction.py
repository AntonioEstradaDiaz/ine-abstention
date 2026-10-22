"""Congelar agregados y procedencia sin usar los resultados precalculados de fase 3."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DataSource, DemographicParticipation, Territory
from app.repositories.statistics import observations


def extract_snapshot(db: Session) -> dict:
    states = observations(db)
    demos = (
        db.execute(
            select(
                Territory.state_code,
                Territory.reference_year.label("year"),
                DemographicParticipation.dimension,
                DemographicParticipation.category,
                DemographicParticipation.nominal_list,
            )
            .join(Territory, Territory.id == DemographicParticipation.territory_id)
            .where(Territory.territory_type == "state")
            .order_by(
                Territory.reference_year,
                Territory.state_code,
                DemographicParticipation.dimension,
                DemographicParticipation.category,
            )
        )
        .mappings()
        .all()
    )
    sources = (
        db.execute(
            select(
                DataSource.id, DataSource.year, DataSource.checksum, DataSource.source_url
            ).order_by(DataSource.year)
        )
        .mappings()
        .all()
    )
    return {
        "observations": states,
        "demographics": [dict(r) for r in demos],
        "sources": [dict(r) for r in sources],
    }
