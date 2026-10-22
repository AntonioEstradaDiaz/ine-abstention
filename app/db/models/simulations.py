from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        CheckConstraint("id ~ '^[a-f0-9]{64}$'", name="fingerprint"),
        CheckConstraint("jsonb_typeof(result) = 'object'", name="result_object"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    forecast_run_id: Mapped[str] = mapped_column(ForeignKey("forecast_runs.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    result: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
