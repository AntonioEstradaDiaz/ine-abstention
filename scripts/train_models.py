"""Entrenar candidatos con cortes por elección; registrar metadatos solo con --register."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy.orm import Session  # noqa: E402
from threadpoolctl import threadpool_limits  # noqa: E402

from app.core.database import get_engine  # noqa: E402
from app.ml.extraction import extract_snapshot  # noqa: E402
from app.ml.registry import register  # noqa: E402
from app.ml.reporting import publish  # noqa: E402
from app.ml.training import train  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="Reproducir desde una instantánea local")
    parser.add_argument("--register", action="store_true", help="Registrar versiones en Supabase")
    args = parser.parse_args()
    if args.snapshot:
        snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    else:
        with Session(get_engine()) as db:
            snapshot = extract_snapshot(db)
    with threadpool_limits(limits=1):
        report, directory = train(snapshot, ROOT)
    if args.register:
        register(report, directory)
    publish(report, directory, ROOT)
    print(
        json.dumps(
            {
                "run_id": report["run_id"],
                "supervised_rows": report["supervised_rows"],
                "selected_on_development": report["development_selected_model"],
                "holdout_metrics": {
                    name: model["holdout_2024"] for name, model in report["models"].items()
                },
            }
        ),
        flush=True,
    )
