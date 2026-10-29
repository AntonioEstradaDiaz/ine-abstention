"""Point 6: temporal separation, integrity, NS sensitivity, external validation gates."""
from copy import deepcopy
from pathlib import Path

import pytest

from app.ml.validation_audit import build_audit, load_residuals, ns_bounds, read_audit

ROOT = Path(__file__).resolve().parents[2]


def test_frozen_backtest_is_complete_and_reproducible():
    audit = read_audit(ROOT)
    assert audit["selected_model"] == "baseline_last"
    assert audit["selection_years"] == [2018, 2021]
    assert audit["unseen_holdout_year"] == 2024
    assert len(audit["state_diagnostics"]) == 32
    assert [y["year"] for y in audit["by_year"]] == [2018, 2021, 2024]
    assert all(y["n_states"] == 32 for y in audit["by_year"])
    assert audit["by_year"][1]["mae_pp"] == pytest.approx(7.981, abs=0.001)
    assert audit["by_year"][2]["mae_pp"] == pytest.approx(3.492, abs=0.001)
    assert audit["production_ready"] is False
    assert audit["external_validation"]["status"] == "not_completed"
    assert audit["calibration"]["coverage_guaranteed"] is False
    assert audit["calibration"]["independent_election_blocks"] == 1


def test_ns_bounds_are_only_target_sensitivity_not_predictive_uncertainty():
    assert ns_bounds(0.5, 0.2) == pytest.approx((0.4, 0.6))
    with pytest.raises(ValueError):
        ns_bounds(0.5, 1.1)
    audit = read_audit(ROOT)
    for row in audit["state_diagnostics"]:
        assert row["illustrative_ns_lower_2024_pct"] <= row["known_abstention_2024_pct"]
        assert row["illustrative_ns_upper_2024_pct"] >= row["known_abstention_2024_pct"]


def test_duplicate_or_missing_state_fails_closed():
    import json

    records = load_residuals(ROOT / "data/samples/ccpc_backtest_errors.csv")
    training = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    forecast = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
    with pytest.raises(ValueError, match="duplicada"):
        build_audit(records + [records[0]], training, forecast)
    with pytest.raises(ValueError, match="Falta una entidad"):
        build_audit(records[1:], training, forecast)


def test_out_of_time_coverage_refuses_future_calibration():
    import json

    records = load_residuals(ROOT / "data/samples/ccpc_backtest_errors.csv")
    training = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    forecast = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
    changed = deepcopy(forecast)
    changed["provenance"]["coverage_diagnostics"][0]["calibration_years"] = [2018]
    with pytest.raises(ValueError, match="Fuga temporal"):
        build_audit(records, training, changed)


def test_selection_is_not_retrofitted_from_holdout():
    import json

    records = load_residuals(ROOT / "data/samples/ccpc_backtest_errors.csv")
    training = json.loads((ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    forecast = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
    changed = deepcopy(training)
    changed["development_selected_model"] = "lightgbm"
    with pytest.raises(ValueError, match="selección"):
        build_audit(records, changed, forecast)
