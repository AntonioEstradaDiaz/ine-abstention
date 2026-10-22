import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.predictions import ForecastRunRead, PredictionRead
from app.schemas.simulations import SimulationRequest
from app.services.simulation_service import describe_rates, simulate


@pytest.fixture
def baseline():
    report = json.loads(
        (Path(__file__).resolve().parents[2] / "docs/phase5_results.json").read_text(
            encoding="utf-8"
        )
    )
    forecast = ForecastRunRead.model_validate(
        {
            **report,
            "created_at": "2026-10-22T00:00:00Z",
        }
    )
    predictions = [PredictionRead.model_validate(p) for p in report["predictions"]]
    return forecast, predictions


def test_zero_change_reproduces_base_without_mutating_input(baseline):
    forecast, predictions = baseline
    original = deepcopy(predictions)
    _, result = simulate(SimulationRequest(participation_change_pp=0), forecast, predictions)
    for row in result["states"]:
        assert row["baseline"] == row["scenario"]
        assert row["applied_participation_change_pp"] == 0
    assert predictions == original
    assert result["summary"]["states_with_risk_change"] == 0
    assert result["assumptions"]["causal_effect_estimated"] is False


@pytest.mark.parametrize("delta", [3, -5])
def test_absolute_change_preserves_complement_and_band_order(baseline, delta):
    forecast, predictions = baseline
    _, result = simulate(SimulationRequest(participation_change_pp=delta), forecast, predictions)
    for row in result["states"]:
        base, scenario = row["baseline"], row["scenario"]
        assert scenario["abstention_rate"] == pytest.approx(base["abstention_rate"] - delta / 100)
        assert scenario["participation_rate"] + scenario["abstention_rate"] == pytest.approx(1)
        assert row["applied_participation_change_pp"] == pytest.approx(delta)
        assert row["applied_abstention_change_pp"] == pytest.approx(-delta)
        assert scenario["participation_band_lower"] == pytest.approx(
            1 - scenario["abstention_band_upper"]
        )
    assert sum(result["summary"]["scenario"]["risk_counts"].values()) == 32
    assert result["summary"]["national_electorate_estimate"] is False
    assert result["summary"]["aggregate_prediction_interval"] is None


def test_original_clipped_band_is_shifted_instead_of_recentred(baseline):
    forecast, predictions = baseline
    p = predictions[0].model_copy(update={"predicted": 0.02, "lower": 0, "upper": 0.12})
    request = SimulationRequest(state_codes=[p.state_code], participation_change_pp=5)
    _, result = simulate(request, forecast, [p])
    row = result["states"][0]
    assert row["scenario"]["abstention_rate"] == 0
    assert row["scenario"]["abstention_band_lower"] == 0
    assert row["scenario"]["abstention_band_upper"] == pytest.approx(0.07)
    assert row["applied_participation_change_pp"] == pytest.approx(2)
    assert row["point_was_clipped"] is True
    assert row["band_was_clipped"] is True


@pytest.mark.parametrize("delta, expected", [(100, 0), (-100, 1)])
def test_extreme_assumptions_stay_within_rate_bounds(baseline, delta, expected):
    forecast, predictions = baseline
    _, result = simulate(SimulationRequest(participation_change_pp=delta), forecast, predictions)
    for row in result["states"]:
        scenario = row["scenario"]
        assert scenario["abstention_rate"] == expected
        assert 0 <= scenario["abstention_band_lower"] <= scenario["abstention_band_upper"] <= 1
        assert row["point_was_clipped"] is True


def test_state_override_replaces_global_shift_and_id_is_order_independent(baseline):
    forecast, predictions = baseline
    request = SimulationRequest(
        state_codes=["02", "01"],
        participation_change_pp=3,
        state_changes=[{"state_code": "02", "participation_change_pp": -2}],
    )
    identifier, result = simulate(request, forecast, predictions[:2])
    assert result["states"][0]["applied_participation_change_pp"] == pytest.approx(3)
    assert result["states"][1]["applied_participation_change_pp"] == pytest.approx(-2)
    reverse = request.model_copy(update={"state_codes": ["01", "02"]})
    assert simulate(reverse, forecast, predictions[:2][::-1])[0] == identifier
    replay = SimulationRequest.model_validate(result["parameters"])
    assert simulate(replay, forecast, predictions[:2])[0] == identifier


def test_risk_equality_and_empty_middle_tercile():
    assert describe_rates(0.5, 0.4, 0.6, [0.3, 0.5])["risk_level"] == "high"
    assert describe_rates(0.5, 0.4, 0.6, [0.5, 0.5])["risk_levels_possible"] == ["low", "high"]


@pytest.mark.parametrize("value", [101, -101, float("nan"), float("inf"), True, "3"])
def test_invalid_assumptions_are_rejected(value):
    with pytest.raises(ValidationError):
        SimulationRequest(participation_change_pp=value)


@pytest.mark.parametrize(
    "params",
    [
        {"state_codes": []},
        {"state_codes": ["33"]},
        {"state_codes": ["01", "01"]},
        {"state_changes": [{"state_code": "01", "participation_change_pp": 1}] * 2},
        {
            "state_codes": ["01"],
            "state_changes": [{"state_code": "02", "participation_change_pp": 1}],
        },
        {"unexpected": 1},
    ],
)
def test_scope_duplicates_and_extra_parameters_are_rejected(params):
    with pytest.raises(ValidationError):
        SimulationRequest(participation_change_pp=3, **params)


def test_missing_predictions_are_never_silently_skipped(baseline):
    forecast, predictions = baseline
    request = SimulationRequest(state_codes=["01", "02"], participation_change_pp=3)
    with pytest.raises(ValueError, match="Faltan predicciones"):
        simulate(request, forecast, predictions[:1])
