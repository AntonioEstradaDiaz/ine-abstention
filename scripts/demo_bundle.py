"""Exportar agregados reales o restaurarlos exclusivamente en una base local de demostración."""

import argparse
import gzip
import hashlib
import io
import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import Date, DateTime, create_engine, func, insert, select, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import get_engine  # noqa: E402
from app.db.models import (  # noqa: E402
    DataSource,
    DemographicParticipation,
    Election,
    ForecastRun,
    IngestionRun,
    ModelVersion,
    ParticipationRecord,
    TerritorialPrediction,
    Territory,
)

TABLES = (
    DataSource,
    Election,
    Territory,
    ParticipationRecord,
    DemographicParticipation,
    ModelVersion,
    ForecastRun,
    TerritorialPrediction,
)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def export_bundle(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    counts = {}
    with get_engine().connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        with (
            (directory / "snapshot.jsonl.gz").open("wb") as raw,
            gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed,
            io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as stream,
        ):
            for model in TABLES:
                columns = [c for c in model.__table__.columns if c.computed is None]
                rows = conn.execute(
                    select(*columns).order_by(model.id).execution_options(yield_per=2000)
                ).mappings()
                count = 0
                for mapping in rows:
                    row = dict(mapping)
                    if model is DataSource:
                        row["local_archive"] = f"demo-source/{row['year']}/original.zip"
                    stream.write(
                        json.dumps(
                            {"table": model.__tablename__, "row": row},
                            ensure_ascii=False,
                            default=lambda value: value.isoformat(),
                            allow_nan=False,
                            sort_keys=True,
                        )
                        + "\n"
                    )
                    count += 1
                counts[model.__tablename__] = count
    manifest = {
        "format": "ine-demo-v1",
        "sha256": digest(directory / "snapshot.jsonl.gz"),
        "rows": counts,
        "notes": [
            "Official aggregates and frozen model/forecast metadata; no raw ZIPs or model weights",
            "Source local_archive paths replaced with portable placeholders",
            "Simulations are recreated by API, not imported",
        ],
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def restore_bundle(directory: Path):
    settings = get_settings()
    url = settings.migration_database_url or settings.database_url
    if settings.environment != "local-demo" or make_url(url).host not in (
        "db",
        "localhost",
        "127.0.0.1",
    ):
        raise ValueError("La restauración solo admite ENVIRONMENT=local-demo y un servidor local")
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if (
        manifest["format"] != "ine-demo-v1"
        or digest(directory / "snapshot.jsonl.gz") != manifest["sha256"]
    ):
        raise ValueError("Paquete de demostración alterado o incompatible")
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('ine-demo-restore'))"))
            marker = conn.execute(
                select(IngestionRun.report).where(
                    IngestionRun.pipeline_version == "demo-snapshot-v1"
                )
            ).scalar_one_or_none()
            if marker is not None:
                counts = {
                    m.__tablename__: conn.scalar(select(func.count()).select_from(m))
                    for m in TABLES
                }
                if marker["sha256"] != manifest["sha256"] or counts != manifest["rows"]:
                    raise ValueError("La base existente difiere del paquete; no se sobrescribe")
                return {"status": "already_restored", "rows": counts}
            if any(conn.scalar(select(func.count()).select_from(m)) for m in TABLES):
                raise ValueError("La restauración exige tablas vacías; no se sobrescriben datos")
            models = {m.__tablename__: m for m in TABLES}
            counts = dict.fromkeys(models, 0)
            with gzip.open(directory / "snapshot.jsonl.gz", "rt", encoding="utf-8") as stream:
                batch, previous = [], None
                for line in stream:
                    record = json.loads(line)
                    model = models[record["table"]]
                    if previous is not None and (model is not previous or len(batch) >= 1000):
                        conn.execute(insert(previous), batch)
                        batch = []
                    row = record["row"]
                    for column in model.__table__.columns:
                        if column.name in row and row[column.name] is not None:
                            if isinstance(column.type, DateTime):
                                row[column.name] = datetime.fromisoformat(row[column.name])
                            elif isinstance(column.type, Date):
                                row[column.name] = date.fromisoformat(row[column.name])
                    batch.append(row)
                    counts[model.__tablename__] += 1
                    previous = model
                if batch:
                    conn.execute(insert(previous), batch)
            if counts != manifest["rows"]:
                raise ValueError("El conteo restaurado no coincide con el manifiesto")
            schema = settings.database_schema
            for model in TABLES:
                if model.__table__.c.id.identity is not None:
                    maximum = conn.scalar(select(func.max(model.id)))
                    if maximum is not None:
                        conn.execute(
                            text(
                                "SELECT setval(pg_get_serial_sequence(:table, 'id'), :value, true)"
                            ),
                            {"table": f"{schema}.{model.__tablename__}", "value": maximum},
                        )
            conn.execute(
                insert(IngestionRun).values(
                    source_id=conn.scalar(select(func.min(DataSource.id))),
                    pipeline_version="demo-snapshot-v1",
                    status="completed",
                    report=manifest,
                )
            )
        return {"status": "restored", "rows": counts}
    finally:
        engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["export", "restore"])
    parser.add_argument("--directory", type=Path, default=ROOT / "data/demo")
    args = parser.parse_args()
    print(
        json.dumps(
            export_bundle(args.directory)
            if args.mode == "export"
            else restore_bundle(args.directory)
        ),
        flush=True,
    )
