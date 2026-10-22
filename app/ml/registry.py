"""Registrar metadatos; los pesos y la instantánea permanecen en los artefactos locales."""

from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.models import ModelVersion
from app.ml.training import verify_manifest


def register(report: dict, run_dir: Path) -> None:
    manifest = verify_manifest(run_dir)
    settings = get_settings()
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )
    try:
        with engine.begin() as connection:
            for name, model in report["models"].items():
                previous = connection.execute(
                    select(ModelVersion.dataset_fingerprint).where(
                        ModelVersion.run_id == report["run_id"], ModelVersion.model_name == name
                    )
                ).scalar_one_or_none()
                if previous is not None and previous != report["dataset_fingerprint"]:
                    raise ValueError("Colisión de versión de experimento")
                files = (
                    model["final_artifact"],
                    model["holdout_evaluation_artifact"],
                    "report.json",
                )
                artifacts = {
                    filename: {
                        "path": f"artifacts/models/{report['run_id']}/{filename}",
                        "sha256": manifest["files"][filename],
                    }
                    for filename in files
                }
                connection.execute(
                    insert(ModelVersion)
                    .values(
                        run_id=report["run_id"],
                        model_name=name,
                        version=f"{report['run_id']}-{name}",
                        status="development_selected"
                        if model["selected_on_development"]
                        else "candidate",
                        dataset_fingerprint=report["dataset_fingerprint"],
                        implementation_fingerprint=report["implementation_fingerprint"],
                        training_period={
                            "final_fit_years": report["training_target_years"],
                            "final_fit_rows": report["supervised_rows"],
                            "holdout_evaluation_fit_years": [2015, 2018, 2021],
                        },
                        features=report["feature_names"],
                        source_datasets=report["source_datasets"],
                        hyperparameters=model["hyperparameters"],
                        metrics={
                            "folds": [
                                {
                                    "test_year": fold["test_year"],
                                    "train_target_years": fold["train_target_years"],
                                    "result": next(
                                        m for m in fold["models"] if m["model_name"] == name
                                    ),
                                }
                                for fold in report["folds"]
                            ],
                            **{
                                k: v
                                for k, v in model.items()
                                if k
                                not in (
                                    "final_artifact",
                                    "holdout_evaluation_artifact",
                                    "hyperparameters",
                                )
                            },
                        },
                        protocol=report["protocol"],
                        package_versions=report["package_versions"],
                        artifact_manifest=artifacts,
                    )
                    .on_conflict_do_nothing(index_elements=["run_id", "model_name"])
                )
    finally:
        engine.dispose()
