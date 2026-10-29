"""Reproducible retrospective forecast audit; never promotes a model to production.

Consumes frozen, out-of-time state predictions. No refit or data-source mutation.
"""
import csv
import json
import math
from collections import defaultdict
from pathlib import Path

YEARS = {2018: "presidential", 2021: "midterm", 2024: "presidential"}
STATE_CODES = {f"{state:02}" for state in range(1, 33)}
REQUIRED = {
    "model_name", "year", "state_code", "election_type", "actual",
    "predicted", "absolute_error_pp", "evaluation_weight", "label_unspecified_rate",
}


def load_residuals(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError("Columnas obligatorias ausentes del backtest")
        records = []
        for item in reader:
            record = {
                "model_name": item["model_name"],
                "year": int(item["year"]),
                "state_code": item["state_code"],
                "election_type": item["election_type"],
            }
            for key in ("actual", "predicted", "absolute_error_pp",
                        "evaluation_weight", "label_unspecified_rate"):
                record[key] = float(item[key])
                if not math.isfinite(record[key]):
                    raise ValueError("Backtest contiene valores no finitos")
            records.append(record)
    return records


def rounded(value: float) -> float:
    return round(value, 6)


def summarize(rows: list[dict]) -> dict:
    errors = [row["predicted"] - row["actual"] for row in rows]
    if not errors:
        raise ValueError("No hay observaciones para calcular errores")
    return {
        "n_states": len(rows),
        "mae_pp": rounded(sum(abs(error) for error in errors) * 100 / len(errors)),
        "rmse_pp": rounded(math.sqrt(sum(error**2 for error in errors) / len(errors)) * 100),
        "bias_pp": rounded(sum(errors) * 100 / len(errors)),
    }


def ns_bounds(actual: float, share: float) -> tuple[float, float]:
    """Illustrative only: assumes all nominal voters are SV, NV or NS."""
    if not 0 <= actual <= 1 or not 0 <= share <= 1:
        raise ValueError("Tasa conocida o NS fuera del intervalo [0,1]")
    lower = actual * (1 - share)
    return lower, lower + share


def build_audit(
    records: list[dict],
    training: dict,
    forecast: dict,
) -> dict:
    models = list(training["models"])
    selected = training["development_selected_model"]
    if selected not in models or training["protocol"]["final_holdout_year"] != 2024:
        raise ValueError("Selección o holdout del experimento incompatibles")
    if training["protocol"]["development_years"] != [2018, 2021]:
        raise ValueError("Se modificó el protocolo temporal del modelo")
    if forecast["provenance"]["model_run_id"] != training["run_id"]:
        raise ValueError("Pronóstico y entrenamiento no coinciden")
    if (
        forecast["provenance"]["model_name"] != selected
        or forecast["target_year"] != 2027
        or forecast["as_of_year"] != 2024
    ):
        raise ValueError("Corrida de pronóstico no compatible con el diagnóstico")

    keys = set()
    by_model_year = defaultdict(list)
    for row in records:
        name, year, state = row["model_name"], row["year"], row["state_code"]
        key = (name, year, state)
        if key in keys or name not in models or year not in YEARS or state not in STATE_CODES:
            raise ValueError("Modelo, año, entidad o clave duplicada inválidos")
        keys.add(key)
        if row["election_type"] != YEARS[year]:
            raise ValueError("Tipo de elección inconsistente")
        if not 0 <= row["actual"] <= 1 or not 0 <= row["predicted"] <= 1:
            raise ValueError("Valor de tasa fuera de [0,1]")
        if not 0 <= row["label_unspecified_rate"] <= 1 or row["evaluation_weight"] <= 0:
            raise ValueError("NS o ponderador de evaluación inválido")
        if abs(abs(row["predicted"] - row["actual"]) * 100 - row["absolute_error_pp"]) > 1e-8:
            raise ValueError("Error declarado no coincide con predicción y dato")
        by_model_year[name, year].append(row)
    for name in models:
        for year in YEARS:
            rows = by_model_year[name, year]
            if {row["state_code"] for row in rows} != STATE_CODES or len(rows) != 32:
                raise ValueError("Falta una entidad en un bloque de evaluación temporal")
        development = by_model_year[name, 2018] + by_model_year[name, 2021]
        expected = training["models"][name]
        if abs(summarize(development)["mae_pp"] - expected["development"]["mae_pp"]) > 1e-5:
            raise ValueError("MAE de desarrollo no coincide con reporte congelado")
        if abs(summarize(by_model_year[name, 2024])["mae_pp"]
               - expected["holdout_2024"]["mae_pp"]) > 1e-5:
            raise ValueError("MAE 2024 no coincide con reporte congelado")

    # Winner was frozen on the development elections. Never rank by holdout.
    winner = min(
        models,
        key=lambda name: (
            summarize(by_model_year[name, 2018] + by_model_year[name, 2021])["mae_pp"],
            models.index(name),
        ),
    )
    if winner != selected:
        raise ValueError("Se cambió la selección usando datos ajenos al desarrollo")

    selected_rows = {year: by_model_year[selected, year] for year in YEARS}
    by_year = []
    for year, kind in YEARS.items():
        rows = selected_rows[year]
        stats = summarize(rows)
        ns_mean = sum(row["label_unspecified_rate"] for row in rows) / len(rows)
        by_year.append({
            "year": year,
            "type": kind,
            **stats,
            "mean_unspecified_pct": rounded(ns_mean * 100),
            "ns_illustrative_mean_width_pp": rounded(ns_mean * 100),
        })

    holdout_models = [
        {"model": name, "mae_2024_pp": summarize(by_model_year[name, 2024])["mae_pp"]}
        for name in models
    ]
    holdout_models.sort(key=lambda row: row["mae_2024_pp"])
    holdout = {row["state_code"]: row for row in selected_rows[2024]}
    development_midterm = {row["state_code"]: row for row in selected_rows[2021]}
    states = []
    for state in sorted(STATE_CODES):
        old = development_midterm[state]
        latest = holdout[state]
        lower, upper = ns_bounds(latest["actual"], latest["label_unspecified_rate"])
        states.append({
            "state_code": state,
            "mae_2021_midterm_pp": rounded(old["absolute_error_pp"]),
            "error_2024_presidential_pp": rounded(latest["absolute_error_pp"]),
            "ns_2024_pct": rounded(latest["label_unspecified_rate"] * 100),
            "known_abstention_2024_pct": rounded(latest["actual"] * 100),
            "illustrative_ns_lower_2024_pct": rounded(lower * 100),
            "illustrative_ns_upper_2024_pct": rounded(upper * 100),
        })

    chrono = forecast["provenance"].get("coverage_diagnostics", [])
    if {item["test_year"] for item in chrono} != set(YEARS):
        raise ValueError("Faltan diagnósticos cronológicos de cobertura")
    for item in chrono:
        if any(year >= item["test_year"] for year in item["calibration_years"]):
            raise ValueError("Fuga temporal al calibrar banda de referencia")
        if item["election_type"] != YEARS[item["test_year"]]:
            raise ValueError("Calibración y elección no son comparables")
        if item["test_rows"] != 32:
            raise ValueError("Cobertura cronológica incompleta")
    uncertainty = forecast["calibration"]["uncertainty"]
    if uncertainty["coverage_guaranteed"] is not False:
        raise ValueError("No es lícito garantizar cobertura de la banda empírica")
    if uncertainty["election_blocks"] != 1 or uncertainty["calibration_years"] != [2021]:
        raise ValueError("Referencia intermedia de 2027 no coincide con un solo bloque")
    if forecast["provenance"]["production_ready"] is not False:
        raise ValueError("No puede promoverse un modelo sin validación externa")

    return {
        "version": "state-backtest-audit-v1",
        "training_run_id": training["run_id"],
        "forecast_run_id": forecast["id"],
        "selected_model": selected,
        "selection_years": [2018, 2021],
        "unseen_holdout_year": 2024,
        "unit": "state",
        "selection_is_development_only": True,
        "by_year": by_year,
        "holdout_models_descriptive_only": holdout_models,
        "state_diagnostics": states,
        "calibration": {
            "year": 2027,
            "type": "midterm",
            "reference_years": uncertainty["calibration_years"],
            "independent_election_blocks": uncertainty["election_blocks"],
            "reference_radius_pp": rounded(uncertainty["radius"] * 100),
            "coverage_guaranteed": False,
            "chronological_coverage": [
                {
                    "year": item["test_year"],
                    "kind": item["election_type"],
                    "prior_reference_years": item["calibration_years"],
                    "radius_pp": rounded(item["radius"] * 100)
                    if item["radius"] is not None else None,
                    "observed_coverage_pct": rounded(item["coverage"] * 100)
                    if item["coverage"] is not None else None,
                    "calibration_blocks": len(item["calibration_years"]),
                }
                for item in chrono
            ],
        },
        "data_quality": {
            "ns_illustration": (
                "Suppose NS is the residual nominal-list fraction. Lower assigns all NS to SV; "
                "upper assigns all NS to NV. This sensitivity of a historical target is "
                "not an error bar or a predictive interval."
            ),
            "ns_excluded_from_known_denominator": True,
            "publication_vintage_verified": False,
        },
        "external_validation": {
            "independent_post_2024_outcome_available": False,
            "held_out_release_vintage_verified": False,
            "independent_external_dataset_verified": False,
            "status": "not_completed",
        },
        "production_ready": False,
        "interpretation": (
            "Retrospective by-election validation only; 32 correlated states per "
            "election are not 32 independent elections. Holdout 2024 is presidential "
            "and cannot certify midterm 2027 performance."
        ),
    }


def read_audit(root: Path) -> dict:
    records = load_residuals(root / "data/samples/ccpc_backtest_errors.csv")
    training = json.loads((root / "docs/phase4_metrics.json").read_text(encoding="utf-8"))
    forecast = json.loads((root / "docs/phase5_results.json").read_text(encoding="utf-8"))
    return build_audit(records, training, forecast)
