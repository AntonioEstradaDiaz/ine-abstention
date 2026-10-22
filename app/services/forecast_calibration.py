"""Política descriptiva congelada: sin probabilidades ni garantías de cobertura."""

import hashlib
import json
from math import ceil, isfinite

LEVEL = 0.90
POLICY_VERSION = "historical-terciles-empirical-errors-v1"
LEVELS = ("low", "medium", "high")


def empirical_quantile(values: list[float], fraction: float) -> float:
    """Cuantil de rango superior de la distribución empírica, sin interpolación."""
    if not values or not 0 < fraction <= 1 or not all(isfinite(v) for v in values):
        raise ValueError("Cuantil sin datos finitos o nivel inválido")
    return sorted(values)[ceil(len(values) * fraction) - 1]


def risk_level(value: float, thresholds: list[float]) -> str:
    if not isfinite(value) or not 0 <= value <= 1:
        raise ValueError("Tasa fuera de [0, 1]")
    return LEVELS[int(value >= thresholds[0]) + int(value >= thresholds[1])]


def calibrate(observations: list[dict], residuals: list[dict], kind: str, cutoff: int) -> dict:
    history = [r for r in observations if r["year"] <= cutoff and r["election_type"] == kind]
    if not history or len({(r["year"], r["state_code"]) for r in history}) != len(history):
        raise ValueError("Historial vacío o duplicado")
    years = sorted({r["year"] for r in history})
    for year in years:
        group = [r for r in history if r["year"] == year]
        if {r["state_code"] for r in group} != {f"{i:02}" for i in range(1, 33)}:
            raise ValueError("La calibración requiere 32 estados por elección")
        if any(r["voter_count"] + r["nonvoter_count"] <= 0 for r in group):
            raise ValueError("Denominador conocido vacío")
    rates = [r["nonvoter_count"] / (r["voter_count"] + r["nonvoter_count"]) for r in history]
    errors = [r for r in residuals if r["year"] <= cutoff and r["election_type"] == kind]
    keys = {(r["year"], r["state_code"]) for r in errors}
    if len(keys) != len(errors):
        raise ValueError("Errores temporales duplicados")
    error_years = sorted({r["year"] for r in errors})
    for year in error_years:
        if {r["state_code"] for r in errors if r["year"] == year} != {
            f"{i:02}" for i in range(1, 33)
        }:
            raise ValueError("El bloque de errores debe contener 32 estados")
    radius = (
        empirical_quantile([abs(r["actual"] - r["predicted"]) for r in errors], LEVEL)
        if errors
        else None
    )
    policy = {
        "version": POLICY_VERSION,
        "as_of_year": cutoff,
        "election_type": kind,
        "risk": {
            "method": "historical_equal_state_election_terciles",
            "quantile_method": "inverse_empirical_cdf_ceiling_rank",
            "thresholds": [empirical_quantile(rates, 1 / 3), empirical_quantile(rates, 2 / 3)],
            "boundary_rule": "low < t1; t1 <= medium < t2; high >= t2",
            "reference_years": years,
            "reference_rows": len(rates),
            "interpretation": "relative historical abstention; not an official INE risk standard",
        },
        "uncertainty": {
            "method": "same_election_type_absolute_out_of_time_errors",
            "reference_quantile": LEVEL,
            "radius": radius,
            "calibration_years": error_years,
            "calibration_rows": len(errors),
            "election_blocks": len(error_years),
            "coverage_guaranteed": False,
            "support": "insufficient" if radius is None else "limited",
            "limitations": [
                "States share election shocks; rows are not independent calibration samples.",
                "Empirical reference band, not a calibrated 90% confidence statement.",
                "Does not cover publication revisions, NS bias or future structural changes.",
            ],
        },
    }
    policy["fingerprint"] = hashlib.sha256(
        json.dumps(policy, sort_keys=True, allow_nan=False).encode()
    ).hexdigest()
    return policy


def uncertainty_and_risk(point: float, policy: dict) -> dict:
    thresholds = policy["risk"]["thresholds"]
    radius = policy["uncertainty"]["radius"]
    lower, upper = (
        (0.0, 1.0) if radius is None else (max(0.0, point - radius), min(1.0, point + radius))
    )
    start, end = risk_level(lower, thresholds), risk_level(upper, thresholds)
    possible = list(LEVELS[LEVELS.index(start) : LEVELS.index(end) + 1])
    return {
        "lower": lower,
        "upper": upper,
        "risk_level": risk_level(point, thresholds),
        "uncertainty": {
            **policy["uncertainty"],
            "risk_levels_possible": possible,
            "classification_uncertain": len(possible) > 1,
            "high_risk_probability": None,
        },
    }


def chronological_coverage(residuals: list[dict]) -> list[dict]:
    """Diagnóstico sin reutilizar errores del año evaluado para construir su banda."""
    results = []
    for year in sorted({r["year"] for r in residuals}):
        test = [r for r in residuals if r["year"] == year]
        kinds = {r["election_type"] for r in test}
        if len(kinds) != 1:
            raise ValueError("Tipos electorales mezclados en un año")
        kind = test[0]["election_type"]
        past = [r for r in residuals if r["year"] < year and r["election_type"] == kind]
        radius = (
            empirical_quantile([abs(r["actual"] - r["predicted"]) for r in past], LEVEL)
            if past
            else None
        )
        results.append(
            {
                "test_year": year,
                "election_type": kind,
                "calibration_years": sorted({r["year"] for r in past}),
                "calibration_rows": len(past),
                "test_rows": len(test),
                "radius": radius,
                "coverage": sum(abs(r["actual"] - r["predicted"]) <= radius for r in test)
                / len(test)
                if radius is not None
                else None,
                "interpretation": "retrospective diagnostic; selection used development years",
            }
        )
    return results
