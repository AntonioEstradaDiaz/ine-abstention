"""Entrenar e interpretar candidatos offline; no ejecutar pesos desde solicitudes HTTP."""

import csv
import hashlib
import json
import re
from pathlib import Path

import joblib
import numpy as np

from app.ml.features import FEATURE_NAMES, build_features
from app.ml.models import matrix
from app.ml.training import canonical, file_hash, train, verify_manifest
from app.services.forecast_calibration import calibrate, uncertainty_and_risk

MODEL_LABELS = {
    "baseline_last": "Última elección comparable",
    "baseline_mean": "Media histórica comparable",
    "ridge": "Regresión Ridge",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "lightgbm": "LightGBM",
}
ML_MODELS = ("ridge", "random_forest", "xgboost", "lightgbm")
FEATURE_LABELS = {
    "previous_abstention_rate": "Abstención de la última elección comparable",
    "historical_mean_abstention": "Media histórica comparable",
    "abstention_trend_pp_per_year": "Tendencia histórica",
    "abstention_volatility_pp": "Variación entre elecciones",
    "previous_participation_change_pp": "Cambio previo de participación",
    "same_type_history_count": "Elecciones comparables disponibles",
    "all_history_count": "Elecciones históricas disponibles",
    "years_since_previous_same_type": "Años desde la elección comparable",
    "last_abstention_rate_all_types": "Abstención de la elección más reciente",
    "previous_unspecified_rate": "Registros NS de la elección comparable",
    "last_unspecified_rate": "Registros NS de la elección más reciente",
    "last_nominal_log1p": "Tamaño del listado nominal histórico",
    "previous_gap_vs_national_pp": "Brecha previa frente al dato nacional",
    "prior_above_national_fraction": "Frecuencia histórica sobre la tasa nacional",
    "state_code": "Identidad de la entidad",
    "election_type": "Tipo de elección",
}


def sample_snapshot(root: Path) -> dict:
    """La muestra solo contiene márgenes estatales; nunca inventar desgloses demográficos."""
    source = root / "data/samples/ccpc_states.csv"
    with source.open(encoding="utf-8") as stream:
        records = list(csv.DictReader(stream))
    observations = []
    seen = set()
    for row in records:
        year, code = int(row["year"]), row["state_code"]
        counts = {key: int(row[key]) for key in ("LN", "SV", "NV", "NS")}
        if code not in {f"{i:02}" for i in range(1, 33)} or (year, code) in seen:
            raise ValueError("Código estatal inválido o fila duplicada")
        if min(counts.values()) < 0 or counts["SV"] + counts["NV"] + counts["NS"] != counts["LN"]:
            raise ValueError("Conteos electorales inconsistentes")
        if counts["SV"] + counts["NV"] == 0:
            raise ValueError("Sin participación conocida")
        seen.add((year, code))
        observations.append(
            {
                "territory_id": int(code),
                "territory_type": "state",
                "state_code": code,
                "name": row["name"],
                "year": year,
                "election_type": "midterm" if year % 6 == 5 else "presidential",
                "comparability_status": "state_code_stable",
                "source_id": year,
                "nominal_list": counts["LN"],
                "voter_count": counts["SV"],
                "nonvoter_count": counts["NV"],
                "unspecified_count": counts["NS"],
            }
        )
    years = sorted({r["year"] for r in observations})
    if years != [2009, 2012, 2015, 2018, 2021, 2024] or len(observations) != 192:
        raise ValueError("Se requieren las seis elecciones completas y 32 estados por elección")
    return {
        "observations": observations,
        "demographics": [],
        "sources": [
            {
                "file": "data/samples/ccpc_states.csv",
                "checksum": file_hash(source),
                "scope": "state aggregates only; no demographic margins",
            }
        ],
    }


def feature_importance(estimator, name: str) -> list[dict]:
    if name.startswith("baseline_"):
        feature = (
            "previous_abstention_rate" if name == "baseline_last" else "historical_mean_abstention"
        )
        return [
            {
                "feature": feature,
                "label": FEATURE_LABELS[feature],
                "weight": 1.0,
                "method": "exact_formula",
            }
        ]
    regressor = estimator.named_steps["regressor"]
    if not hasattr(regressor, "feature_importances_"):
        return []
    names = estimator.named_steps["preprocess"].get_feature_names_out()
    grouped = {}
    for feature, value in zip(names, regressor.feature_importances_, strict=True):
        key = feature.split("__", 1)[-1].removeprefix("missingindicator_")
        # El preprocesador recibe matrices, por lo que sklearn nombra x0, x1, ...
        # También se agrupan las categorías y los indicadores de ausencia por variable original.
        index = re.match(r"x(\d+)(?:_|$)", key)
        if index:
            key = FEATURE_NAMES[int(index.group(1))]
        if key.startswith("state_code_"):
            key = "state_code"
        if key.startswith("election_type_"):
            key = "election_type"
        grouped[key] = grouped.get(key, 0) + float(value)
    total = sum(grouped.values())
    method = {"random_forest": "impurity", "xgboost": "gain", "lightgbm": "split_count"}[name]
    return [
        {
            "feature": key,
            "label": FEATURE_LABELS.get(key, key),
            "weight": value / total,
            "method": method,
        }
        for key, value in sorted(grouped.items(), key=lambda p: (-p[1], p[0]))
        if value > 0
    ]


def materialize(snapshot: dict, report: dict, directory: Path, target_year=2027) -> dict:
    verify_manifest(directory)
    if hashlib.sha256(canonical(snapshot)).hexdigest() != report["dataset_fingerprint"]:
        raise ValueError("Los datos no coinciden con el experimento entrenado")
    observations = snapshot["observations"]
    cutoff = max(r["year"] for r in observations)
    if target_year <= cutoff or target_year % 6 != 5:
        raise ValueError("Este laboratorio solo pronostica una elección intermedia futura")
    latest = sorted((r for r in observations if r["year"] == cutoff), key=lambda r: r["state_code"])
    examples = [
        build_features(r["state_code"], target_year, "midterm", observations, {}) for r in latest
    ]
    with (directory / "out_of_time_predictions.csv").open(encoding="utf-8") as stream:
        errors = list(csv.DictReader(stream))
    baseline = [r["features"]["previous_abstention_rate"] for r in examples]
    preferred = min(ML_MODELS, key=lambda name: report["models"][name]["development"]["mae_pp"])
    models = []
    for name, label in MODEL_LABELS.items():
        own = report["models"][name]
        # Solo artefactos generados localmente, cubiertos por el manifiesto verificado.
        estimator = joblib.load(directory / own["final_artifact"])
        values = np.clip(np.asarray(estimator.predict(matrix(examples)), dtype=float), 0, 1)
        if not np.isfinite(values).all():
            raise ValueError("Predicción no finita")
        residuals = [
            {
                "year": int(r["year"]),
                "state_code": r["state_code"],
                "election_type": r["election_type"],
                "actual": float(r["actual"]),
                "predicted": float(r["predicted"]),
            }
            for r in errors
            if r["model_name"] == name
        ]
        calibration = calibrate(observations, residuals, "midterm", cutoff)
        forecasts = []
        for row, example, point, reference in zip(latest, examples, values, baseline, strict=True):
            f = example["features"]
            forecasts.append(
                {
                    "state_code": row["state_code"],
                    "name": row["name"],
                    "predicted": float(point),
                    **uncertainty_and_risk(float(point), calibration),
                    "baseline_prediction": reference,
                    "delta_vs_baseline_pp": (float(point) - reference) * 100,
                    "features": {key: f[key] for key in FEATURE_LABELS},
                    "feature_source_years": example["lineage"]["feature_source_years"],
                }
            )
        models.append(
            {
                "name": name,
                "label": label,
                "kind": "ml" if name in ML_MODELS else "baseline",
                "development_mae_pp": own["development"]["mae_pp"],
                "holdout_mae_pp": own["holdout_2024"]["mae_pp"],
                "holdout_rmse_pp": own["holdout_2024"]["rmse_pp"],
                "selected_on_development": name == report["development_selected_model"],
                "preferred_ml": name == preferred,
                "calibration": calibration,
                "important_features": feature_importance(estimator, name),
                "forecasts": forecasts,
            }
        )
    return {
        "version": "state-ml-laboratory-v1",
        "run_id": report["run_id"],
        "created_at": report["created_at"],
        "target_year": target_year,
        "as_of_year": cutoff,
        "dataset_fingerprint": report["dataset_fingerprint"],
        "implementation_fingerprint": report["implementation_fingerprint"],
        "package_versions": report["package_versions"],
        "data": {
            "source": snapshot["sources"][0]["file"],
            "source_sha256": snapshot["sources"][0]["checksum"],
            "rows": len(observations),
            "state_count": len(latest),
            "years": sorted({r["year"] for r in observations}),
            "supervised_rows": report["supervised_rows"],
            "demographics_available": False,
        },
        "protocol": {
            **report["protocol"],
            "preferred_ml_model": preferred,
            "selected_model": report["development_selected_model"],
        },
        "folds": [
            {
                "test_year": fold["test_year"],
                "train_target_years": fold["train_target_years"],
                "train_rows": fold["train_rows"],
                "test_rows": fold["test_rows"],
            }
            for fold in report["folds"]
        ],
        "models": models,
        "limitations": [
            "Muestra de agregados estatales: sin desgloses demográficos ni variables de seguridad o campañas.",
            "32 estados y solo seis elecciones; los estados comparten choques electorales.",
            "Selección con 2018/2021; 2024 se reserva para evaluación, no para elegir el modelo.",
            "Las bandas usan errores de la intermedia 2021: un solo bloque de calibración, sin cobertura garantizada.",
            "Validación retrospectiva por año electoral; fechas históricas de publicación no verificadas.",
            "La importancia describe el ajuste del modelo, no efectos causales ni recomendaciones de intervención.",
            "Los escenarios trasladan tasas y bandas con un supuesto; no predicen efectos de campañas o políticas.",
        ],
    }


def build_laboratory(root: Path) -> dict:
    snapshot = sample_snapshot(root)
    report, directory = train(snapshot, root)
    result = materialize(snapshot, report, directory)
    path = root / "data/samples/ml_laboratory.json"
    path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    return result
