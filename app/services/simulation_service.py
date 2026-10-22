"""Escenarios deterministas: cambios supuestos, sin estimar efectos de intervenciones."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from statistics import fmean

from app.schemas.predictions import ForecastRunRead, PredictionRead
from app.schemas.simulations import SimulationRequest, SimulationResult
from app.services.forecast_calibration import LEVELS, risk_level

ENGINE_VERSION = "participation-absolute-shift-v1"


@lru_cache
def implementation_sha256() -> str:
    directory = Path(__file__).resolve().parent
    files = (
        Path(__file__),
        directory / "forecast_calibration.py",
        directory.parent / "schemas/simulations.py",
    )
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    return hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()


def clamp(value: float) -> float:
    return min(1.0, max(0.0, value))


def describe_rates(point: float, lower: float, upper: float, thresholds: list[float]) -> dict:
    # Evaluar extremos y fronteras evita asignar un nivel vacío si ambos terciles coinciden.
    candidates = [lower, upper, *(t for t in thresholds if lower <= t <= upper)]
    levels = {risk_level(value, thresholds) for value in candidates}
    possible = [level for level in LEVELS if level in levels]
    return {
        "abstention_rate": point,
        "participation_rate": 1 - point,
        "abstention_band_lower": lower,
        "abstention_band_upper": upper,
        "participation_band_lower": 1 - upper,
        "participation_band_upper": 1 - lower,
        "risk_level": risk_level(point, thresholds),
        "risk_levels_possible": possible,
        "classification_uncertain": len(possible) > 1,
    }


def aggregate(states: list[dict], key: str) -> dict:
    return {
        "mean_abstention_rate": fmean(s[key]["abstention_rate"] for s in states),
        "mean_participation_rate": fmean(s[key]["participation_rate"] for s in states),
        "risk_counts": {
            level: sum(s[key]["risk_level"] == level for s in states) for level in LEVELS
        },
        "uncertain_classifications": sum(s[key]["classification_uncertain"] for s in states),
    }


def simulate(
    request: SimulationRequest,
    forecast: ForecastRunRead,
    predictions: list[PredictionRead],
) -> tuple[str, dict]:
    """La banda se traslada con el mismo cambio supuesto; no se vuelve a centrar su radio."""
    if not predictions:
        raise ValueError("Sin predicciones para el alcance seleccionado")
    if (
        request.forecast_run_id is not None
        and request.forecast_run_id != forecast.id
        or request.target_year is not None
        and request.target_year != forecast.target_year
    ):
        raise ValueError("Los parámetros no corresponden al escenario base")
    predictions = sorted(predictions, key=lambda p: p.state_code)
    codes = [p.state_code for p in predictions]
    if len(codes) != len(set(codes)):
        raise ValueError("Predicciones estatales duplicadas")
    if request.state_codes is not None and set(codes) != set(request.state_codes):
        raise ValueError("Faltan predicciones para entidades seleccionadas")
    changes = {
        change.state_code: change.participation_change_pp for change in request.state_changes
    }
    if not set(changes) <= set(codes):
        raise ValueError("Faltan predicciones para cambios territoriales")
    thresholds = forecast.calibration["risk"]["thresholds"]
    states = []
    for p in predictions:
        if not p.lower <= p.predicted <= p.upper:
            raise ValueError("Banda base inconsistente")
        change = changes.get(p.state_code, request.participation_change_pp)
        shift = change / 100
        raw, raw_lower, raw_upper = p.predicted - shift, p.lower - shift, p.upper - shift
        point, lower, upper = clamp(raw), clamp(raw_lower), clamp(raw_upper)
        baseline = describe_rates(p.predicted, p.lower, p.upper, thresholds)
        scenario = describe_rates(point, lower, upper, thresholds)
        # Restar las abstenciones evita la cancelación de dos complementos calculados por separado.
        applied = (p.predicted - point) * 100
        states.append(
            {
                "territory_id": p.territory_id,
                "state_code": p.state_code,
                "name": p.name,
                "baseline": baseline,
                "scenario": scenario,
                "requested_participation_change_pp": change,
                "applied_participation_change_pp": applied,
                "applied_abstention_change_pp": -applied,
                "point_was_clipped": not 0 <= raw <= 1,
                "band_was_clipped": not (0 <= raw_lower <= raw_upper <= 1),
                "risk_changed": baseline["risk_level"] != scenario["risk_level"],
            }
        )
    parameters = request.model_copy(
        update={
            "forecast_run_id": forecast.id,
            "target_year": forecast.target_year,
            "state_codes": codes,
            "state_changes": sorted(request.state_changes, key=lambda change: change.state_code),
        }
    )
    result = SimulationResult.model_validate(
        {
            "engine_version": ENGINE_VERSION,
            "implementation_sha256": implementation_sha256(),
            "forecast": forecast,
            "parameters": parameters,
            "assumptions": {
                "method": (
                    "scenario_abstention = "
                    "clip(base_abstention - participation_change_pp/100, 0, 1)"
                ),
                "sign": "positive increases participation; negative decreases participation",
                "state_changes": "replace the global change for that state; never add to it",
                "change_type": "absolute percentage points, not a relative percent change",
                "causal_effect_estimated": False,
                "base_prediction_retrained": False,
                "denominator": "SV + NV; NS excluded, as in the base forecast",
                "future_voter_counts_estimated": False,
                "risk_thresholds": "fixed to the base forecast calibration, without recalibration",
                "uncertainty": {
                    "method": "translate original endpoints by the fixed assumed change and clip",
                    "coverage_guaranteed": False,
                    "intervention_effect_uncertainty_included": False,
                    "base_calibration": forecast.calibration["uncertainty"],
                    "interpretation": "conditional sensitivity band; coverage remains unverified",
                },
                "aggregation": "equal weights per selected state; not a national electorate rate",
                "aggregate_interval": "unavailable due to spatial dependence between states",
                "limitations": [
                    "The user supplies the change; it is not learned from intervention evidence.",
                    "No causal, demographic, partisan or individual effects are inferred.",
                    "Clipping may narrow a band without increasing evidential confidence.",
                    "All limitations of the base forecast continue to apply.",
                ],
            },
            "summary": {
                "selected_states": len(states),
                "aggregation": "unweighted_mean_of_selected_states",
                "national_electorate_estimate": False,
                "baseline": aggregate(states, "baseline"),
                "scenario": aggregate(states, "scenario"),
                "mean_applied_participation_change_pp": fmean(
                    s["applied_participation_change_pp"] for s in states
                ),
                "states_with_risk_change": sum(s["risk_changed"] for s in states),
                "states_with_clipped_point": sum(s["point_was_clipped"] for s in states),
                "states_with_clipped_band": sum(s["band_was_clipped"] for s in states),
                "aggregate_prediction_interval": None,
            },
            "states": states,
        }
    ).model_dump(mode="json")
    canonical = json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()
    return hashlib.sha256(canonical).hexdigest(), result
