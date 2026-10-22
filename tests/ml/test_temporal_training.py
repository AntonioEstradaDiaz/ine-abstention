import json

import pytest

pytest.importorskip("sklearn")
pytest.importorskip("xgboost")
pytest.importorskip("lightgbm")

import joblib
import numpy as np
from test_features import examples

from app.ml.evaluation import choose_on_development, metrics, temporal_folds
from app.ml.models import MODEL_SPECS, build_model, matrix
from app.ml.training import file_hash, fit_predict, verify_manifest


def test_entire_elections_are_held_out_and_future_lineage_is_rejected():
    data = examples()
    for year, train, test in temporal_folds(data):
        assert len(test) == 32
        assert len(train) == {2018: 32, 2021: 64, 2024: 96}[year]
        assert max(r["year"] for r in train) < year
        assert {r["year"] for r in test} == {year}
    data[0]["lineage"]["feature_source_years"].append(2024)
    with pytest.raises(ValueError, match="Fuga temporal"):
        list(temporal_folds(data))


def test_evaluation_metrics_have_pp_units_and_constant_target_is_not_fake_r2():
    result = metrics([0.2, 0.4], [0.2, 0.6], [1, 3])
    assert result["mae_pp"] == pytest.approx(10)
    assert result["rmse_pp"] == pytest.approx(2**0.5 * 10)
    assert result["weighted_mae_pp"] == pytest.approx(15)
    assert result["r_squared"] == pytest.approx(-1)
    assert metrics([0.2, 0.2], [0.3, 0.3])["r_squared"] is None
    with pytest.raises(ValueError):
        metrics([float("nan")], [0.5])


def test_final_holdout_cannot_change_model_selection():
    records = [
        {
            "model_name": name,
            "year": year,
            "actual": 0.5,
            "predicted": 0.51 if name == "baseline_last" else 0.505,
            "evaluation_weight": 100,
        }
        for name in ("baseline_last", "ridge")
        for year in (2018, 2021, 2024)
    ]
    first = choose_on_development(records, ["baseline_last", "ridge"])[0]
    for row in records:
        if row["year"] == 2024:
            row["predicted"] = 0 if row["model_name"] == "ridge" else 0.5
    assert first == choose_on_development(records, ["baseline_last", "ridge"])[0] == "ridge"


@pytest.mark.parametrize("name", list(MODEL_SPECS))
def test_each_declared_candidate_fits_and_predicts_finite_bounded_results(name):
    _, train, test = next(temporal_folds(examples()))
    _, _, prediction, _ = fit_predict(name, train, test)
    assert prediction.shape == (32,)
    assert np.isfinite(prediction).all()
    assert ((prediction >= 0) & (prediction <= 1)).all()


def test_preprocessing_does_not_learn_test_categories_or_statistics(tmp_path):
    _, train, test = next(temporal_folds(examples()))
    pipeline = build_model("ridge").fit(matrix(train), [r["label"] for r in train])
    transformer = pipeline.named_steps["preprocess"]
    imputer = transformer.named_transformers_["numeric"].named_steps["impute"]
    assert imputer.statistics_[0] == pytest.approx(np.median(matrix(train)[:, 0].astype(float)))
    encoder = transformer.named_transformers_["categories"]
    assert list(encoder.categories_[-1]) == ["midterm"]
    expected = pipeline.predict(matrix(test))
    assert list(encoder.categories_[-1]) == ["midterm"]
    target = tmp_path / "trusted_test_model.joblib"
    joblib.dump(pipeline, target)
    assert joblib.load(target).predict(matrix(test)) == pytest.approx(expected)


def test_artifact_integrity_rejects_modified_files(tmp_path):
    target = tmp_path / "model.txt"
    target.write_text("original", encoding="utf-8")
    (tmp_path / "manifest.json").write_text(json.dumps({"files": {"model.txt": file_hash(target)}}))
    verify_manifest(tmp_path)
    target.write_text("changed", encoding="utf-8")
    with pytest.raises(ValueError, match="modificado"):
        verify_manifest(tmp_path)
