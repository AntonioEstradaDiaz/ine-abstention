import csv
import math
from pathlib import Path

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("xgboost")
pytest.importorskip("lightgbm")

import joblib
import numpy as np

from app.ml.features import FEATURE_NAMES, build_features
from app.ml.laboratory import ML_MODELS, materialize, sample_snapshot
from app.ml.models import matrix
from app.ml.training import train
from app.schemas.laboratory import LaboratoryReport

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def experiment(tmp_path_factory):
    snapshot = sample_snapshot(ROOT)
    report, directory = train(snapshot, tmp_path_factory.mktemp("laboratory"))
    result = materialize(snapshot, report, directory)
    return snapshot, report, directory, result


def test_lab_scores_are_measured_out_of_time_and_selection_uses_development(experiment):
    snapshot, report, directory, result = experiment
    LaboratoryReport.model_validate(result)
    assert len(snapshot["observations"]) == 192
    assert snapshot["demographics"] == []
    with (directory / "out_of_time_predictions.csv").open(encoding="utf-8") as stream:
        records = list(csv.DictReader(stream))
    for model in result["models"]:
        own = [r for r in records if r["model_name"] == model["name"]]
        for years, key in (({2018, 2021}, "development_mae_pp"), ({2024}, "holdout_mae_pp")):
            errors = [
                abs(float(r["actual"]) - float(r["predicted"])) * 100
                for r in own
                if int(r["year"]) in years
            ]
            assert len(errors) == 32 * len(years)
            assert model[key] == pytest.approx(sum(errors) / len(errors))
        assert len({p["state_code"] for p in model["forecasts"]}) == 32
        for p in model["forecasts"]:
            assert 0 <= p["lower"] <= p["predicted"] <= p["upper"] <= 1
            assert max(p["feature_source_years"]) < result["target_year"]
        assert model["calibration"]["uncertainty"]["calibration_years"] == [2021]
        assert model["calibration"]["uncertainty"]["coverage_guaranteed"] is False
    best = min(result["models"], key=lambda m: m["development_mae_pp"])
    best_ml = min(
        (m for m in result["models"] if m["name"] in ML_MODELS),
        key=lambda m: m["development_mae_pp"],
    )
    assert (
        result["protocol"]["selected_model"] == best["name"] == report["development_selected_model"]
    )
    assert result["protocol"]["preferred_ml_model"] == best_ml["name"]
    assert result["protocol"]["production_ready"] is False
    for fold in result["folds"]:
        assert max(fold["train_target_years"]) < fold["test_year"]
        assert fold["test_rows"] == 32


def test_random_forest_forecasts_come_from_the_fitted_estimator(experiment):
    snapshot, report, directory, result = experiment
    forest = next(m for m in result["models"] if m["name"] == "random_forest")
    estimator = joblib.load(directory / report["models"]["random_forest"]["final_artifact"])
    examples = [
        build_features(p["state_code"], 2027, "midterm", snapshot["observations"], {})
        for p in forest["forecasts"]
    ]
    expected = np.clip(estimator.predict(matrix(examples)), 0, 1)
    assert [p["predicted"] for p in forest["forecasts"]] == pytest.approx(expected)
    assert any(abs(p["predicted"] - p["baseline_prediction"]) > 0.001 for p in forest["forecasts"])
    assert math.isclose(sum(f["weight"] for f in forest["important_features"]), 1)
    assert all(
        f["feature"] in FEATURE_NAMES and f["label"] != f["feature"]
        for f in forest["important_features"]
    )


def test_materialization_rejects_past_targets_and_modified_model_artifacts(experiment):
    snapshot, report, directory, _ = experiment
    with pytest.raises(ValueError, match="futura"):
        materialize(snapshot, report, directory, 2021)
    artifact = directory / "protocol.json"
    original = artifact.read_bytes()
    try:
        artifact.write_text("{}", encoding="utf-8")
        with pytest.raises(ValueError, match="modificado"):
            materialize(snapshot, report, directory)
    finally:
        artifact.write_bytes(original)


@pytest.mark.parametrize("corruption", ["counts", "duplicate"])
def test_sample_import_rejects_unreconciled_counts_and_duplicates(tmp_path, corruption):
    source = ROOT / "data/samples/ccpc_states.csv"
    with source.open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    if corruption == "counts":
        rows[0]["NV"] = str(int(rows[0]["NV"]) + 1)
    else:
        rows.append(rows[0])
    target = tmp_path / "data/samples/ccpc_states.csv"
    target.parent.mkdir(parents=True)
    with target.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    with pytest.raises(ValueError):
        sample_snapshot(tmp_path)
