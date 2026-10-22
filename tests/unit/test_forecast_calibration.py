from copy import deepcopy

import pytest

from app.services.forecast_calibration import (
    calibrate,
    chronological_coverage,
    empirical_quantile,
    risk_level,
    uncertainty_and_risk,
)


def history():
    return [
        {
            "year": year,
            "state_code": f"{state:02}",
            "election_type": kind,
            "voter_count": 100 - state,
            "nonvoter_count": state,
        }
        for year, kind in ((2015, "midterm"), (2021, "midterm"), (2024, "presidential"))
        for state in range(1, 33)
    ]


def errors():
    return [
        {
            "year": year,
            "state_code": f"{state:02}",
            "election_type": kind,
            "actual": 0.4 + state / 1000,
            "predicted": 0.4,
        }
        for year, kind in ((2018, "presidential"), (2021, "midterm"), (2024, "presidential"))
        for state in range(1, 33)
    ]


def test_calibration_uses_past_and_same_type_only():
    original = calibrate(history(), errors(), "midterm", 2021)
    changed = deepcopy(history())
    for row in changed:
        if row["year"] > 2021:
            row["nonvoter_count"] = 10000
    changed_errors = deepcopy(errors())
    for row in changed_errors:
        if row["year"] > 2021:
            row["actual"] = 0.99
    assert calibrate(changed, changed_errors, "midterm", 2021) == original
    assert original["risk"]["reference_rows"] == 64
    assert original["uncertainty"]["calibration_years"] == [2021]
    assert original["uncertainty"]["coverage_guaranteed"] is False
    assert original["uncertainty"]["election_blocks"] == 1


def test_quantiles_boundaries_and_ambiguous_classification():
    assert empirical_quantile(list(range(1, 33)), 0.9) == 29
    assert risk_level(0.2, [0.2, 0.3]) == "medium"
    assert risk_level(0.3, [0.2, 0.3]) == "high"
    policy = calibrate(history(), errors(), "midterm", 2021)
    interval = uncertainty_and_risk(0.22, policy)
    assert interval["lower"] < 0.22 < interval["upper"]
    assert interval["uncertainty"]["classification_uncertain"] is True
    assert interval["uncertainty"]["high_risk_probability"] is None
    assert uncertainty_and_risk(0, policy)["lower"] == 0
    assert uncertainty_and_risk(1, policy)["upper"] == 1


def test_no_residuals_returns_full_range_instead_of_false_precision():
    policy = calibrate(history(), [], "midterm", 2021)
    band = uncertainty_and_risk(0.5, policy)
    assert (band["lower"], band["upper"]) == (0, 1)
    assert band["uncertainty"]["support"] == "insufficient"


def test_coverage_diagnostic_never_calibrates_on_test_year():
    residuals = errors()
    original = chronological_coverage(residuals)
    assert original[0]["coverage"] is None
    assert original[1]["coverage"] is None
    assert original[2]["calibration_years"] == [2018]
    for row in residuals:
        if row["year"] == 2024:
            row["actual"] = 1
    changed = chronological_coverage(residuals)
    assert changed[2]["radius"] == original[2]["radius"]
    assert changed[2]["coverage"] == 0


def test_partial_or_duplicate_calibration_blocks_are_rejected():
    with pytest.raises(ValueError, match="32 estados"):
        calibrate(history()[1:], errors(), "midterm", 2021)
    with pytest.raises(ValueError, match="duplicado"):
        calibrate(history() + history()[:1], errors(), "midterm", 2021)
    with pytest.raises(ValueError, match="duplicados"):
        calibrate(history(), errors() + [errors()[32]], "midterm", 2021)
    with pytest.raises(ValueError):
        empirical_quantile([float("nan")], 0.9)
