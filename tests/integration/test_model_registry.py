import csv
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION") != "1" or os.getenv("RUN_ML_INTEGRATION") != "1",
        reason="Set RUN_INTEGRATION=1 and RUN_ML_INTEGRATION=1 after training",
    ),
]


def test_registered_metrics_match_verified_experiment():
    report = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    with TestClient(app) as client:
        response = client.get(f"/api/v1/models/metrics?run_id={report['run_id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["dataset_fingerprint"] == report["dataset_fingerprint"]
    assert body["selected_on_development"] == report["development_selected_model"]
    assert len(body["models"]) == 6
    assert len(body["source_datasets"]) == 6
    assert body["protocol"]["production_ready"] is False
    for model in body["models"]:
        expected = report["models"][model["model_name"]]
        assert model["metrics"]["holdout_2024"] == expected["holdout_2024"]
        assert model["metrics"]["development"]["n"] == 64
        assert model["metrics"]["holdout_2024"]["n"] == 32
        assert len(model["metrics"]["folds"]) == 3


def test_frozen_holdout_model_reproduces_recorded_predictions():
    pytest.importorskip("sklearn")
    import joblib
    import numpy as np

    from app.ml.models import matrix
    from app.ml.training import verify_manifest

    report = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    directory = ROOT / "artifacts/models" / report["run_id"]
    verify_manifest(directory)
    dataset = json.loads((directory / "supervised_dataset.json").read_text(encoding="utf-8"))
    testing = [r for r in dataset["examples"] if r["year"] == 2024]
    for example in testing:
        assert max(example["lineage"]["feature_source_years"]) < example["year"]
    name = report["development_selected_model"]
    estimator = joblib.load(directory / report["models"][name]["holdout_evaluation_artifact"])
    actual = np.clip(estimator.predict(matrix(testing)), 0, 1)
    with (directory / "out_of_time_predictions.csv").open(encoding="utf-8") as f:
        expected = [
            float(row["predicted"])
            for row in csv.DictReader(f)
            if row["model_name"] == name and row["year"] == "2024"
        ]
    assert actual == pytest.approx(expected)
