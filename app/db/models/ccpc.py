from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    institution: Mapped[str] = mapped_column(String(40))
    dataset_name: Mapped[str] = mapped_column(String(200))
    year: Mapped[int] = mapped_column(Integer)
    source_url: Mapped[str] = mapped_column(Text)
    landing_url: Mapped[str] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    byte_size: Mapped[int] = mapped_column(BigInteger)
    local_archive: Mapped[str] = mapped_column(Text)
    license_notes: Mapped[str] = mapped_column(Text)
    inventory: Mapped[dict] = mapped_column(JSONB)
    quality_report: Mapped[dict] = mapped_column(JSONB)


class Election(Base):
    __tablename__ = "elections"
    __table_args__ = (CheckConstraint("election_type IN ('presidential', 'midterm')", name="type"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, unique=True)
    election_date: Mapped[date] = mapped_column(Date)
    election_type: Mapped[str] = mapped_column(String(20))


class Territory(Base):
    __tablename__ = "territories"
    __table_args__ = (
        UniqueConstraint("source_id", "official_code", "territory_type"),
        CheckConstraint("territory_type IN ('state', 'municipality')", name="type"),
        Index(
            "ix_territories_catalog",
            "territory_type",
            "reference_year",
            "state_code",
            "official_code",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    territory_type: Mapped[str] = mapped_column(String(20))
    official_code: Mapped[str] = mapped_column(String(10))
    state_code: Mapped[str] = mapped_column(String(2), index=True)
    municipality_code: Mapped[str | None] = mapped_column(String(3))
    name: Mapped[str] = mapped_column(String(200))
    reference_year: Mapped[int] = mapped_column(Integer)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("territories.id"), index=True)
    cartography_reference: Mapped[str] = mapped_column(String(160))
    comparability_status: Mapped[str] = mapped_column(String(40))


class CountsMixin:
    nominal_list: Mapped[int] = mapped_column(BigInteger)
    voter_count: Mapped[int] = mapped_column(BigInteger)
    nonvoter_count: Mapped[int] = mapped_column(BigInteger)
    unspecified_count: Mapped[int] = mapped_column(BigInteger)
    participation_rate: Mapped[float | None] = mapped_column(
        Float,
        Computed(
            "voter_count::double precision / NULLIF(voter_count + nonvoter_count, 0)",
            persisted=True,
        ),
    )
    abstention_rate: Mapped[float | None] = mapped_column(
        Float,
        Computed(
            "nonvoter_count::double precision / NULLIF(voter_count + nonvoter_count, 0)",
            persisted=True,
        ),
    )
    unspecified_rate: Mapped[float | None] = mapped_column(
        Float,
        Computed("unspecified_count::double precision / NULLIF(nominal_list, 0)", persisted=True),
    )


def count_checks() -> tuple[CheckConstraint, ...]:
    return (
        CheckConstraint(
            "nominal_list >= 0 AND voter_count >= 0 "
            "AND nonvoter_count >= 0 AND unspecified_count >= 0",
            name="nonnegative_counts",
        ),
        CheckConstraint(
            "nominal_list = voter_count + nonvoter_count + unspecified_count",
            name="reconciled_counts",
        ),
    )


class ParticipationRecord(CountsMixin, Base):
    __tablename__ = "participation_records"
    __table_args__ = (UniqueConstraint("source_id", "territory_id"), *count_checks())

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    election_id: Mapped[int] = mapped_column(ForeignKey("elections.id"), index=True)
    territory_id: Mapped[int] = mapped_column(ForeignKey("territories.id"), index=True)


class DemographicParticipation(CountsMixin, Base):
    __tablename__ = "demographic_participation"
    __table_args__ = (
        UniqueConstraint("territory_id", "dimension", "category"),
        CheckConstraint("dimension IN ('sex', 'age_band', 'section_type')", name="dimension"),
        *count_checks(),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    territory_id: Mapped[int] = mapped_column(ForeignKey("territories.id"), index=True)
    dimension: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(20))


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    pipeline_version: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    report: Mapped[dict] = mapped_column(JSONB)
