"""Experimento temporal congelado, trazable y reproducible por elección completa."""

import csv
import hashlib
import json
import warnings
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

import joblib
import numpy as np

from app.ml.evaluation import (
    DEVELOPMENT_YEARS,
    HOLDOUT_YEAR,
    TEST_YEARS,
    choose_on_development,
    metrics,
    temporal_folds,
)
from app.ml.features import FEATURE_NAMES, FEATURE_VERSION, build_dataset
from app.ml.models import MODEL_SPECS, SEED, build_model, matrix

PROTOCOL = {
    "version": "state-temporal-v1",
    "feature_version": FEATURE_VERSION,
    "unit": "state",
    "target": "NV / (SV + NV)",
    "seed": SEED,
    "outer_test_years": list(TEST_YEARS),
    "development_years": list(DEVELOPMENT_YEARS),
    "final_holdout_year": HOLDOUT_YEAR,
    "primary_metric": "unweighted_state_mae_pp",
    "selection": "lowest_development_MAE_only; ties follow declared model order",
    "hyperparameter_search": "none; fixed presets before evaluation",
    "preprocessing": "fit exclusively on training election blocks; unknown categories ignored",
    "prediction_bounds": "clip all predictions to [0, 1]; report clipping count",
    "baselines": ["last comparable election", "mean of prior comparable elections"],
    "final_refit": "refit every fixed candidate on all eligible labels after holdout evaluation",
    "publication_vintage_verified": False,
    "validation_interpretation": (
        "retrospective event-year validation, not a verified historical data-release backtest"
    ),
    "production_ready": False,
}


def canonical(data) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, allow_nan=False).encode("utf-8")


def file_hash(path: Path) -> str:
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def verify_manifest(run_dir: Path) -> dict:
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["files"].items():
        path = (run_dir / name).resolve()
        if not path.is_relative_to(run_dir.resolve()) or file_hash(path) != digest:
            raise ValueError("Artefacto modificado o fuera de su directorio")
    return manifest


def fit_predict(name: str, train: list[dict], test: list[dict]):
    estimator = build_model(name)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        estimator.fit(matrix(train), np.asarray([row["label"] for row in train]))
        raw = np.asarray(estimator.predict(matrix(test)), dtype=float)
    if not np.isfinite(raw).all():
        raise ValueError(f"Predicción no finita: {name}")
    return estimator, raw, np.clip(raw, 0, 1), sorted({str(w.message) for w in caught})


def train(snapshot: dict, root: Path) -> tuple[dict, Path]:
    packages = {
        name: version(name) for name in ("numpy", "scikit-learn", "xgboost", "lightgbm", "joblib")
    }
    code_dir = Path(__file__).resolve().parent
    code = {p.name: file_hash(p) for p in sorted(code_dir.glob("*.py"))}
    implementation = hashlib.sha256(canonical(code)).hexdigest()
    fingerprint = hashlib.sha256(canonical(snapshot)).hexdigest()
    full_run_hash = hashlib.sha256(
        canonical(
            {
                "data": fingerprint,
                "code": implementation,
                "protocol": PROTOCOL,
                "models": MODEL_SPECS,
                "packages": packages,
            }
        )
    ).hexdigest()
    run_id = full_run_hash[:20]
    run_dir = root / "artifacts/models" / run_id
    if (run_dir / "manifest.json").exists():
        verify_manifest(run_dir)
        return json.loads((run_dir / "report.json").read_text(encoding="utf-8")), run_dir
    if run_dir.exists():
        raise ValueError(f"Experimento incompleto: revisar {run_dir} antes de repetir")
    examples, excluded = build_dataset(snapshot["observations"], snapshot["demographics"])
    folds = list(temporal_folds(examples))
    run_dir.mkdir(parents=True)
    (run_dir / "protocol.json").write_bytes(canonical({**PROTOCOL, "model_presets": MODEL_SPECS}))
    (run_dir / "source_snapshot.json").write_bytes(canonical(snapshot))
    (run_dir / "supervised_dataset.json").write_bytes(
        canonical({"examples": examples, "excluded": excluded})
    )
    records, fold_results, fold_models = [], [], {}

    # Primero se ajustan y puntúan únicamente los cortes de desarrollo.
    def evaluate(year, training, testing):
        current = []
        for name in MODEL_SPECS:
            estimator, raw, predicted, notices = fit_predict(name, training, testing)
            filename = f"fold_{year}_{name}.joblib"
            joblib.dump(estimator, run_dir / filename)
            fold_models[(year, name)] = filename
            score = metrics(
                [r["label"] for r in testing], predicted, [r["evaluation_weight"] for r in testing]
            )
            current.append(
                {
                    "model_name": name,
                    "test_year": year,
                    "metrics": score,
                    "clipped_predictions": int(((raw < 0) | (raw > 1)).sum()),
                    "warnings": notices,
                }
            )
            for row, value, unbounded in zip(testing, predicted, raw, strict=True):
                records.append(
                    {
                        "model_name": name,
                        "year": year,
                        "state_code": row["state_code"],
                        "election_type": row["election_type"],
                        "actual": row["label"],
                        "predicted": float(value),
                        "raw_prediction": float(unbounded),
                        "absolute_error_pp": float(abs(value - row["label"]) * 100),
                        "evaluation_weight": row["evaluation_weight"],
                        "label_unspecified_rate": row["label_unspecified_rate"],
                    }
                )
        kinds = {r["election_type"] for r in training}
        fold_results.append(
            {
                "test_year": year,
                "train_target_years": sorted({r["year"] for r in training}),
                "train_rows": len(training),
                "test_rows": len(testing),
                "test_election_types_unseen_in_training": sorted(
                    {r["election_type"] for r in testing} - kinds
                ),
                "models": current,
            }
        )

    for year, training, testing in folds:
        if year in DEVELOPMENT_YEARS:
            evaluate(year, training, testing)
    winner, development = choose_on_development(records, list(MODEL_SPECS))
    (run_dir / "frozen_development_selection.json").write_bytes(
        canonical(
            {
                "selected_model": winner,
                "scores": development,
                "used_years": list(DEVELOPMENT_YEARS),
            }
        )
    )
    # La selección ya está escrita y congelada antes de puntuar 2024.
    for year, training, testing in folds:
        if year == HOLDOUT_YEAR:
            evaluate(year, training, testing)
    models = {}
    for name in MODEL_SPECS:
        own = [r for r in records if r["model_name"] == name]
        final_estimator = build_model(name)
        final_estimator.fit(matrix(examples), np.asarray([r["label"] for r in examples]))
        final_file = f"final_{name}.joblib"
        joblib.dump(final_estimator, run_dir / final_file)
        holdout = [r for r in own if r["year"] == HOLDOUT_YEAR]
        by_type = {}
        for kind in sorted({r["election_type"] for r in own}):
            group = [r for r in own if r["election_type"] == kind]
            by_type[kind] = metrics([r["actual"] for r in group], [r["predicted"] for r in group])
        models[name] = {
            "development": development[name],
            "holdout_2024": metrics(
                [r["actual"] for r in holdout],
                [r["predicted"] for r in holdout],
                [r["evaluation_weight"] for r in holdout],
            ),
            "all_outer_folds_descriptive": metrics(
                [r["actual"] for r in own], [r["predicted"] for r in own]
            ),
            "by_election_type_descriptive": by_type,
            "final_artifact": final_file,
            "holdout_evaluation_artifact": fold_models[(HOLDOUT_YEAR, name)],
            "hyperparameters": MODEL_SPECS[name],
            "selected_on_development": name == winner,
        }
    with (run_dir / "out_of_time_predictions.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    report = {
        "run_id": run_id,
        "full_run_hash": full_run_hash,
        "created_at": datetime.now(UTC).isoformat(),
        "dataset_fingerprint": fingerprint,
        "implementation_fingerprint": implementation,
        "source_files": code,
        "package_versions": packages,
        "protocol": PROTOCOL,
        "source_datasets": snapshot["sources"],
        "feature_names": FEATURE_NAMES,
        "supervised_rows": len(examples),
        "excluded_rows": len(excluded),
        "training_target_years": sorted({r["year"] for r in examples}),
        "folds": fold_results,
        "models": models,
        "development_selected_model": winner,
        "selected_model_holdout_mae_delta_vs_baseline_pp": (
            models[winner]["holdout_2024"]["mae_pp"]
            - models["baseline_last"]["holdout_2024"]["mae_pp"]
        ),
        "limitations": [
            "32 states; spatially dependent observations",
            "only two development election blocks and one final holdout election",
            "first development fold has an unseen election type in supervised training",
            "municipalities excluded pending temporal crosswalk",
            "NS and historical data coverage may bias the observed target",
            "historical publication vintages not verified; retrospective event-year backtest only",
            "no predictive intervals, causal effects, or production promotion in this phase",
        ],
    }
    (run_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    manifest = {
        "run_id": run_id,
        "files": {p.name: file_hash(p) for p in sorted(run_dir.iterdir()) if p.is_file()},
    }
    (run_dir / "manifest.json").write_bytes(canonical(manifest))
    verify_manifest(run_dir)
    return report, run_dir
