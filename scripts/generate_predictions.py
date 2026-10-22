"""Materializar el escenario estatal futuro con la selección registrada, sin reentrenar."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.database import get_engine  # noqa: E402
from app.db.models import ModelVersion  # noqa: E402
from app.ml.forecasting import generate, publish_forecast, register_forecast  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-year", type=int, default=2027)
    parser.add_argument("--election-type", choices=["midterm", "presidential"], default="midterm")
    parser.add_argument(
        "--model-run", help="Experimento registrado; por defecto la selección más reciente"
    )
    parser.add_argument("--register", action="store_true")
    args = parser.parse_args()
    with Session(get_engine()) as db:
        query = select(ModelVersion).where(ModelVersion.status == "development_selected")
        if args.model_run:
            query = query.where(ModelVersion.run_id == args.model_run)
        model = db.scalar(
            query.order_by(ModelVersion.created_at.desc(), ModelVersion.id.desc()).limit(1)
        )
        if model is None:
            raise SystemExit("No hay modelo seleccionado registrado")
        metadata = {c.name: getattr(model, c.name) for c in model.__table__.columns}
    report = generate(ROOT, metadata, args.target_year, args.election_type)
    if args.register:
        register_forecast(report)
    publish_forecast(report, ROOT)
    print(
        json.dumps(
            {
                "forecast_run_id": report["id"],
                "target_year": report["target_year"],
                "states": len(report["predictions"]),
                "calibration": report["calibration"],
                "coverage_diagnostics": report["provenance"]["coverage_diagnostics"],
                "risk_counts": {
                    level: sum(p["risk_level"] == level for p in report["predictions"])
                    for level in ("low", "medium", "high")
                },
            }
        ),
        flush=True,
    )
