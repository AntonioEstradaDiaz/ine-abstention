"""Inferencia offline con artefactos locales verificados; la API solo lee resultados."""

import csv
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.models import ForecastRun, TerritorialPrediction
from app.ml.features import (
    FEATURE_NAMES,
    abstention,
    build_dataset,
    build_features,
    demographic_index,
    unspecified,
)
from app.ml.models import HistoricalBaseline, matrix
from app.ml.training import canonical, file_hash, verify_manifest
from app.services.forecast_calibration import (
    calibrate,
    chronological_coverage,
    uncertainty_and_risk,
)


def generate(root: Path, model: dict, target_year: int, kind: str) -> dict:
    directory = root / "artifacts/models" / model["run_id"]
    # Anclar los pesos y el informe al registro de Supabase antes de deserializar.
    for item in model["artifact_manifest"].values():
        path = (root / item["path"]).resolve()
        if not path.is_relative_to(directory.resolve()) or file_hash(path) != item["sha256"]:
            raise ValueError("El artefacto no coincide con el registro de Supabase")
    manifest = verify_manifest(directory)
    report = json.loads((directory / "report.json").read_text(encoding="utf-8"))
    name = report["development_selected_model"]
    if name != model["model_name"] or model["status"] != "development_selected":
        raise ValueError("Selección del modelo inconsistente")
    if name != "baseline_last":
        raise ValueError("El nuevo modelo requiere su propio adaptador de explicación")
    if report["feature_names"] != FEATURE_NAMES:
        raise ValueError("Contrato de variables incompatible")
    for filename in ("features.py", "models.py"):
        if file_hash(Path(__file__).with_name(filename)) != report["source_files"][filename]:
            raise ValueError("Cambió el código de variables o estimador; revisar compatibilidad")
    snapshot = json.loads((directory / "source_snapshot.json").read_text(encoding="utf-8"))
    if hashlib.sha256(canonical(snapshot)).hexdigest() != model["dataset_fingerprint"]:
        raise ValueError("La instantánea no coincide con el entrenamiento registrado")
    rows = snapshot["observations"]
    build_dataset(rows, snapshot["demographics"])  # Valida continuidad y claves únicas.
    cutoff = max(r["year"] for r in rows)
    if target_year <= cutoff or kind not in ("midterm", "presidential"):
        raise ValueError("La predicción debe ser futura y declarar un tipo electoral válido")
    latest = sorted((r for r in rows if r["year"] == cutoff), key=lambda r: r["state_code"])
    if {r["state_code"] for r in latest} != {f"{i:02}" for i in range(1, 33)}:
        raise ValueError("Se requieren las 32 entidades")
    demo = demographic_index(snapshot["demographics"])
    with (directory / "out_of_time_predictions.csv").open(encoding="utf-8") as f:
        residuals = [
            {
                "year": int(r["year"]),
                "state_code": r["state_code"],
                "election_type": r["election_type"],
                "actual": float(r["actual"]),
                "predicted": float(r["predicted"]),
            }
            for r in csv.DictReader(f)
            if r["model_name"] == name
        ]
    # Comprobar que los residuos del baseline proceden de cortes anteriores al objetivo.
    expected_keys = {
        (r["year"], r["state_code"])
        for r in rows
        if r["year"] in report["protocol"]["outer_test_years"]
    }
    if {(r["year"], r["state_code"]) for r in residuals} != expected_keys:
        raise ValueError("Cortes temporales incompletos")
    for error in residuals:
        actual = next(
            r for r in rows if (r["year"], r["state_code"]) == (error["year"], error["state_code"])
        )
        feature = build_features(
            error["state_code"], error["year"], error["election_type"], rows, demo
        )
        if (
            error["election_type"] != actual["election_type"]
            or abs(error["actual"] - abstention(actual)) > 1e-12
            or abs(error["predicted"] - feature["features"]["previous_abstention_rate"]) > 1e-12
        ):
            raise ValueError("Residuo inconsistente con el baseline temporal")
    calibration = calibrate(rows, residuals, kind, cutoff)
    prepared = [build_features(r["state_code"], target_year, kind, rows, demo) for r in latest]
    estimator = joblib.load(directory / report["models"][name]["final_artifact"])
    if (
        not isinstance(estimator, HistoricalBaseline)
        or estimator.feature != "previous_abstention_rate"
    ):
        raise ValueError("Estimador incompatible con la explicación")
    points = np.asarray(estimator.predict(matrix(prepared)), dtype=float)
    if not np.isfinite(points).all() or ((points < 0) | (points > 1)).any():
        raise ValueError("Predicciones inválidas")
    predictions = []
    for current, features, point in zip(latest, prepared, points, strict=True):
        year = features["lineage"]["previous_same_type_year"]
        reference = next(
            r for r in rows if r["state_code"] == current["state_code"] and r["year"] == year
        )
        if abs(point - abstention(reference)) > 1e-12:
            raise ValueError("La explicación no reproduce el estimador")
        predictions.append(
            {
                "territory_id": current["territory_id"],
                "state_code": current["state_code"],
                "name": current["name"],
                "predicted": float(point),
                **uncertainty_and_risk(float(point), calibration),
                "explanation": {
                    "method": "exact_baseline_identity",
                    "causal": False,
                    "formula": "prediction = previous comparable NV / (SV + NV)",
                    "reference_year": year,
                    "source_id": reference["source_id"],
                    "voter_count": reference["voter_count"],
                    "nonvoter_count": reference["nonvoter_count"],
                    "reference_unspecified_rate": unspecified(reference),
                    "used_features": [{"name": "previous_abstention_rate", "value": float(point)}],
                    "context_only": {
                        key: features["features"][key]
                        for key in (
                            "historical_mean_abstention",
                            "abstention_trend_pp_per_year",
                            "previous_gap_vs_national_pp",
                            "same_type_history_count",
                        )
                    },
                    "missing_status_bounds_in_reference_election": {
                        "lower": reference["nonvoter_count"] / reference["nominal_list"],
                        "upper": (reference["nonvoter_count"] + reference["unspecified_count"])
                        / reference["nominal_list"],
                        "interpretation": "historical NS scenarios, separate from forecast bands",
                    },
                },
                "lineage": {**features["lineage"], "territory_reference_year": cutoff},
            }
        )
    provenance = {
        "model_run_id": model["run_id"],
        "model_name": name,
        "dataset_fingerprint": model["dataset_fingerprint"],
        "model_sha256": manifest["files"][report["models"][name]["final_artifact"]],
        "residuals_sha256": manifest["files"]["out_of_time_predictions.csv"],
        "source_datasets": snapshot["sources"],
        "publication_vintage_verified": False,
        "production_ready": False,
        "target_interpretation": "analytical future election scenario, without INE endorsement",
        "rate_units": "fraction [0,1]; trend and gaps in percentage points",
        "coverage_diagnostics": chronological_coverage(residuals),
        "code_sha256": {
            "forecasting.py": file_hash(Path(__file__)),
            "forecast_calibration.py": file_hash(root / "app/services/forecast_calibration.py"),
        },
    }
    result = {
        "model_version_id": model["id"],
        "target_year": target_year,
        "as_of_year": cutoff,
        "election_type": kind,
        "calibration": calibration,
        "provenance": provenance,
        "predictions": predictions,
    }
    fingerprint = hashlib.sha256(canonical(result)).hexdigest()
    return {"id": fingerprint[:20], "fingerprint": fingerprint, **result}


def register_forecast(report: dict) -> None:
    settings = get_settings()
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )
    try:
        with engine.begin() as connection:
            existing = connection.execute(
                select(ForecastRun.fingerprint).where(ForecastRun.id == report["id"])
            ).scalar_one_or_none()
            if existing:
                if existing != report["fingerprint"]:
                    raise ValueError("Colisión de versión de predicción")
                return
            connection.execute(
                insert(ForecastRun).values({k: v for k, v in report.items() if k != "predictions"})
            )
            connection.execute(
                insert(TerritorialPrediction),
                [{"forecast_run_id": report["id"], **p} for p in report["predictions"]],
            )
    finally:
        engine.dispose()


def publish_forecast(report: dict, root: Path) -> None:
    directory = root / "artifacts/predictions" / report["id"]
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "report.json").write_bytes(canonical(report))
    (directory / "manifest.json").write_bytes(
        canonical({"files": {"report.json": file_hash(directory / "report.json")}})
    )
    (root / "docs/phase5_results.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    with (root / "data/samples/territorial_predictions.csv").open(
        "w", newline="", encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "state_code",
                "name",
                "target_year",
                "predicted",
                "lower",
                "upper",
                "risk_level",
                "classification_uncertain",
            ],
        )
        writer.writeheader()
        for p in report["predictions"]:
            writer.writerow(
                {
                    **{
                        k: p[k]
                        for k in ("state_code", "name", "predicted", "lower", "upper", "risk_level")
                    },
                    "target_year": report["target_year"],
                    "classification_uncertain": p["uncertainty"]["classification_uncertain"],
                }
            )
