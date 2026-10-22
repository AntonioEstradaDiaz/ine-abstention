from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Identity,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ModelVersion(Base):
    __tablename__ = "model_versions"
    __table_args__ = (
        UniqueConstraint("run_id", "model_name"),
        CheckConstraint("status IN ('development_selected', 'candidate')", name="status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(20), index=True)
    model_name: Mapped[str] = mapped_column(String(40))
    version: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[str] = mapped_column(String(30))
    dataset_fingerprint: Mapped[str] = mapped_column(String(64))
    implementation_fingerprint: Mapped[str] = mapped_column(String(64))
    training_period: Mapped[dict] = mapped_column(JSONB)
    features: Mapped[list] = mapped_column(JSONB)
    source_datasets: Mapped[list] = mapped_column(JSONB)
    hyperparameters: Mapped[dict] = mapped_column(JSONB)
    metrics: Mapped[dict] = mapped_column(JSONB)
    protocol: Mapped[dict] = mapped_column(JSONB)
    package_versions: Mapped[dict] = mapped_column(JSONB)
    artifact_manifest: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
