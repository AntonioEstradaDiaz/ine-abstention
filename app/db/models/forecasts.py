from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ForecastRun(Base):
    __tablename__ = "forecast_runs"
    __table_args__ = (
        CheckConstraint("target_year > as_of_year", name="future_target"),
        CheckConstraint("election_type IN ('midterm', 'presidential')", name="election_type"),
    )

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"), index=True)
    target_year: Mapped[int] = mapped_column(Integer, index=True)
    as_of_year: Mapped[int] = mapped_column(Integer)
    election_type: Mapped[str] = mapped_column(String(20))
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    calibration: Mapped[dict] = mapped_column(JSONB)
    provenance: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TerritorialPrediction(Base):
    __tablename__ = "territorial_predictions"
    __table_args__ = (
        UniqueConstraint("forecast_run_id", "state_code"),
        CheckConstraint(
            "0 <= lower AND lower <= predicted AND predicted <= upper AND upper <= 1", name="bounds"
        ),
        CheckConstraint("risk_level IN ('low', 'medium', 'high')", name="risk_level"),
        CheckConstraint("state_code ~ '^(0[1-9]|[12][0-9]|3[0-2])$'", name="state_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    forecast_run_id: Mapped[str] = mapped_column(ForeignKey("forecast_runs.id"))
    territory_id: Mapped[int] = mapped_column(ForeignKey("territories.id"), index=True)
    state_code: Mapped[str] = mapped_column(String(2))
    name: Mapped[str] = mapped_column(String(150))
    predicted: Mapped[float] = mapped_column(Double)
    lower: Mapped[float] = mapped_column(Double)
    upper: Mapped[float] = mapped_column(Double)
    risk_level: Mapped[str] = mapped_column(String(10))
    uncertainty: Mapped[dict] = mapped_column(JSONB)
    explanation: Mapped[dict] = mapped_column(JSONB)
    lineage: Mapped[dict] = mapped_column(JSONB)
