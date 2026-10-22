"""Datos sintéticos para validar matemáticas, denominadores y cortes temporales."""

import pytest

from app.services.statistics_service import (
    StatisticsConflict,
    StatisticsNotFound,
    annual_series,
    history_metrics,
    rates,
    summary,
    territory_indicators,
    trends,
)


def record(year=2024, state="01", sv=50, nv=30, ns=20, *, level="state"):
    return {
        "territory_id": year * 100 + int(state),
        "territory_type": level,
        "official_code": state if level == "state" else f"{state}:001",
        "state_code": state,
        "name": "Territorio de prueba",
        "year": year,
        "election_type": "presidential" if year in (2012, 2018, 2024) else "midterm",
        "source_id": year,
        "comparability_status": "state_code_stable" if level == "state" else "requires_crosswalk",
        "nominal_list": sv + nv + ns,
        "voter_count": sv,
        "nonvoter_count": nv,
        "unspecified_count": ns,
    }


def test_unknowns_preserved_and_bounds_are_not_prediction_intervals():
    result = rates(record())
    assert result["participation_rate"] == 0.625
    assert result["abstention_rate"] == 0.375
    assert result["unspecified_rate"] == 0.2
    assert result["known_participation_fraction"] == 0.8
    assert result["missing_data_abstention_lower"] == 0.3
    assert result["missing_data_abstention_upper"] == 0.5


def test_no_known_participation_does_not_invent_a_rate():
    result = rates(record(sv=0, nv=0, ns=100))
    assert result["abstention_rate"] is None
    assert result["missing_data_abstention_lower"] == 0
    assert result["missing_data_abstention_upper"] == 1
    assert rates(record(sv=0, nv=0, ns=0))["unspecified_rate"] is None


def test_summary_weights_counts_and_never_adds_municipalities():
    # Promediar los porcentajes daría 50%; ponderar conteos da 18%.
    rows = [record(sv=1, nv=9, ns=0), record(state="02", sv=81, nv=9, ns=0)]
    point = summary(rows)["items"][0]
    assert point["abstention_rate"] == pytest.approx(0.18)
    assert point["territory_count"] == 2
    assert "incomplete_territorial_coverage" in point["quality_notes"]


def test_summary_keeps_previous_same_type_when_filtering_one_year():
    rows = [
        record(2018, sv=70, nv=30, ns=0),
        record(2021, sv=20, nv=80, ns=0),
        record(2024, sv=60, nv=40, ns=0),
    ]
    point = summary(rows, year=2024)["items"][0]
    assert point["previous_comparable_year"] == 2018
    assert point["abstention_change_pp"] == pytest.approx(10)
    assert point["participation_change_pp"] == pytest.approx(-10)


def test_trends_separate_presidential_and_midterm_and_respect_cutoff():
    rows = [record(year) for year in (2009, 2012, 2015, 2018, 2021, 2024)]
    response = trends(rows, through_year=2018)
    groups = {s["election_type"]: s["metrics"] for s in response["series"]}
    assert groups["presidential"]["years"] == [2012, 2018]
    assert groups["midterm"]["years"] == [2009, 2015]
    assert groups["presidential"]["abstention_slope_pp_per_year"] is None


def test_trend_uses_elapsed_years_and_reports_pp_per_year():
    points = [
        {"year": year, **rates(record(year, sv=100 - nv, nv=nv, ns=0))}
        for year, nv in ((2012, 20), (2018, 26), (2024, 32))
    ]
    metrics = history_metrics(points)
    assert metrics["abstention_slope_pp_per_year"] == pytest.approx(1)
    assert metrics["participation_slope_pp_per_year"] == pytest.approx(-1)
    assert metrics["abstention_sample_std_pp"] == pytest.approx(6)
    assert metrics["linear_fit_r_squared"] == pytest.approx(1)
    assert metrics["direction"] == "increasing_abstention"


def test_flat_series_has_no_explained_variation_r_squared():
    points = [{"year": year, **rates(record(year))} for year in (2012, 2018, 2024)]
    metrics = history_metrics(points)
    assert metrics["direction"] == "flat"
    assert metrics["linear_fit_r_squared"] is None


def test_zero_denominator_is_excluded_from_trend_without_becoming_zero():
    points = [
        {"year": 2012, **rates(record(sv=0, nv=0, ns=100))},
        {"year": 2018, **rates(record())},
    ]
    metrics = history_metrics(points)
    assert metrics["observed_elections"] == 2
    assert metrics["valid_elections"] == 1
    assert metrics["abstention_sample_std_pp"] is None
    assert metrics["abstention_slope_pp_per_year"] is None


def test_persistence_requires_three_complete_comparable_elections():
    rows = [
        record(year, f"{state:02}", sv=20 if state == 1 else 80, nv=80 if state == 1 else 20, ns=0)
        for year in (2012, 2018, 2024)
        for state in range(1, 33)
    ]
    snapshot = next(r for r in rows if r["year"] == 2024 and r["state_code"] == "01")
    indicator = territory_indicators(rows, [snapshot], year=2024)[0]
    assert indicator["persistent_low_participation"] is True
    assert indicator["above_national_in_last_three"] == 3
    old = next(r for r in rows if r["year"] == 2018 and r["state_code"] == "01")
    assert territory_indicators(rows, [old], year=2018)[0]["persistent_low_participation"] is None


def test_incomplete_reference_does_not_label_persistent_low_participation():
    rows = [record(year, sv=20, nv=80, ns=0) for year in (2012, 2018, 2024)]
    assert (
        territory_indicators(rows, [rows[-1]], year=2024)[0]["persistent_low_participation"] is None
    )


def test_municipalities_are_snapshots_without_synthetic_history():
    rows = [record(year) for year in (2012, 2018, 2024)]
    snapshot = record(level="municipality", sv=60, nv=40, ns=0)
    item = territory_indicators(rows, [snapshot], year=2024)[0]
    assert item["history"] is None
    assert item["participation_change_pp"] is None
    assert item["persistent_low_participation"] is None
    assert item["gap_vs_state_abstention_pp"] == pytest.approx(2.5)
    assert "municipal_history_requires_crosswalk" in item["quality_notes"]


def test_past_territorial_indicators_do_not_use_future_observations():
    rows = [record(year, sv=70, nv=30, ns=0) for year in (2012, 2018, 2024)]
    item = territory_indicators(rows, [rows[1]], year=2018)[0]
    assert item["history"]["years"] == [2012, 2018]
    assert item["history"]["abstention_slope_pp_per_year"] is None


def test_duplicate_versions_and_empty_inputs_are_explicit():
    with pytest.raises(StatisticsConflict):
        summary([record(), record()])
    with pytest.raises(StatisticsNotFound):
        summary([])
    with pytest.raises(StatisticsNotFound):
        trends([record()], election_type="midterm")


def test_missing_previous_known_rate_yields_null_change():
    points = annual_series([record(2018, sv=0, nv=0, ns=10), record(2024)], 1)
    assert points[-1]["previous_comparable_year"] == 2018
    assert points[-1]["participation_change_pp"] is None
