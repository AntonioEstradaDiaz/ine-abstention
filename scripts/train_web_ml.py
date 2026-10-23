"""Entrenar los seis estimadores y materializar el laboratorio web sin base de datos."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml.laboratory import build_laboratory  # noqa: E402

if __name__ == "__main__":
    report = build_laboratory(ROOT)
    print(
        f"ML run: {report['run_id']}; "
        f"selected on development: {report['protocol']['selected_model']}"
    )
    for model in report["models"]:
        print(
            f"{model['name']}: development MAE {model['development_mae_pp']:.3f} pp; "
            f"2024 MAE {model['holdout_mae_pp']:.3f} pp; {len(model['forecasts'])} forecasts"
        )
