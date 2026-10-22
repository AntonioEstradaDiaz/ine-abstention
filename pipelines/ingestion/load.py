"""Carga transaccional e idempotente de agregados CCPC validados."""

import hashlib
import json
from datetime import UTC, date, datetime
from pathlib import Path

import polars as pl
from psycopg import sql
from sqlalchemy import create_engine, func, insert, select, text, update
from sqlalchemy.engine import Connection
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.models import (
    DataSource,
    DemographicParticipation,
    Election,
    IngestionRun,
    ParticipationRecord,
    Territory,
)
from pipelines.transformation.ccpc import COUNTS, DATES, PIPELINE_VERSION, DataQualityError

COUNT_MAPPING = dict(
    zip(COUNTS, ("nominal_list", "voter_count", "nonvoter_count", "unspecified_count"), strict=True)
)


def official_code(row: dict) -> str:
    if row["territory_type"] == "state":
        return row["state_code"]
    return f"{row['state_code']}:{row['municipality_code']}"


def verify_bundle(root: Path, year: int) -> tuple[dict, dict, pl.DataFrame, pl.DataFrame]:
    output = root / "data/processed/ccpc" / str(year)
    report = json.loads((output / "quality.json").read_text(encoding="utf-8"))
    source_dir = root / "data/raw/ccpc" / str(year)
    source = json.loads((source_dir / "inventory.json").read_text(encoding="utf-8"))
    if report["status"] != "validated" or report["pipeline_version"] != PIPELINE_VERSION:
        raise DataQualityError("Paquete rechazado o versión de transformación distinta")
    if report["year"] != year or source["year"] != year:
        raise DataQualityError("Año del paquete no corresponde")
    with (source_dir / "original.zip").open("rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
    if digest != source["sha256"] or digest != report["source_sha256"]:
        raise DataQualityError("ZIP alterado después de validación")
    for filename in ("territories.parquet", "demographics.parquet"):
        with (output / filename).open("rb") as f:
            digest = hashlib.file_digest(f, "sha256").hexdigest()
        if digest != report["artifacts"][filename]:
            raise DataQualityError(f"Agregado alterado después de validación: {filename}")
    return (
        source,
        report,
        pl.read_parquet(output / "territories.parquet"),
        pl.read_parquet(output / "demographics.parquet"),
    )


def copy_rows(conn: Connection, table: str, columns: list[str], rows) -> None:
    """COPY desde el cliente: no leer archivos del servidor de Supabase."""
    query = sql.SQL("COPY {} ({}) FROM STDIN").format(
        sql.Identifier(get_settings().database_schema, table),
        sql.SQL(", ").join(map(sql.Identifier, columns)),
    )
    with conn.connection.driver_connection.cursor() as cursor, cursor.copy(query) as copy:
        for row in rows:
            copy.write_row(row)


def load(root: Path, year: int) -> dict:
    source, quality, totals, demographic = verify_bundle(root, year)
    settings = get_settings()
    engine = create_engine(
        settings.migration_database_url or settings.database_url,
        poolclass=NullPool,
        connect_args={"connect_timeout": 10},
    )
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext('ccpc-ingestion'))"))
            previous = conn.execute(
                select(DataSource.id).where(DataSource.checksum == source["sha256"])
            ).scalar_one_or_none()
            if previous is not None:
                version = conn.execute(
                    select(IngestionRun.pipeline_version).where(
                        IngestionRun.source_id == previous, IngestionRun.status == "completed"
                    )
                ).scalar_one_or_none()
                if version != PIPELINE_VERSION:
                    raise DataQualityError(
                        "Fuente existente con otra versión; requiere revisión explícita"
                    )
                return {"year": year, "status": "skipped", "source_id": previous}
            if conn.execute(select(DataSource.id).where(DataSource.year == year)).first():
                raise DataQualityError(
                    "Hay otra versión del ZIP para este año; no se reemplaza automáticamente"
                )
            if (
                conn.execute(text("SELECT pg_database_size(current_database())")).scalar_one()
                > 450 * 1024 * 1024
            ):
                raise DataQualityError(
                    "La base supera el presupuesto local de 450 MiB; revisar antes de cargar"
                )
            catalog = json.loads(
                (root / "pipelines/ingestion/sources.json").read_text(encoding="utf-8")
            )
            source_id = conn.execute(
                insert(DataSource)
                .values(
                    institution="INE",
                    dataset_name=f"Conteos Censales de Participación Ciudadana {year}",
                    year=year,
                    source_url=source["url"],
                    landing_url=catalog["landing_url"],
                    retrieved_at=datetime.fromisoformat(source["retrieved_at"]),
                    checksum=source["sha256"],
                    byte_size=source["bytes"],
                    local_archive=f"data/raw/ccpc/{year}/original.zip",
                    license_notes=(
                        "Datos agregados públicos del INE. Conservar atribución. "
                        "No se presume una licencia no indicada en el ZIP."
                    ),
                    inventory=source,
                    quality_report=quality,
                )
                .returning(DataSource.id)
            ).scalar_one()
            run_id = conn.execute(
                insert(IngestionRun)
                .values(
                    source_id=source_id,
                    pipeline_version=PIPELINE_VERSION,
                    status="loading",
                    report={},
                )
                .returning(IngestionRun.id)
            ).scalar_one()
            election_id = conn.execute(
                select(Election.id).where(Election.year == year)
            ).scalar_one_or_none()
            if election_id is None:
                election_id = conn.execute(
                    insert(Election)
                    .values(
                        year=year,
                        election_date=date.fromisoformat(DATES[year]),
                        election_type="presidential" if year in (2012, 2018, 2024) else "midterm",
                    )
                    .returning(Election.id)
                ).scalar_one()
            territory_ids = {}
            for level in ("state", "municipality"):
                payload = []
                for row in totals.filter(pl.col("territory_type") == level).iter_rows(named=True):
                    payload.append(
                        {
                            "source_id": source_id,
                            "territory_type": level,
                            "official_code": official_code(row),
                            "state_code": row["state_code"],
                            "municipality_code": row["municipality_code"] or None,
                            "name": row["name"],
                            "reference_year": year,
                            "parent_id": territory_ids.get(row["state_code"]),
                            "cartography_reference": (
                                f"CSV INE {year}; DEF/DEL DERFE "
                                f"{2023 if year == 2024 else 2021}; sin homologación municipal"
                            ),
                            "comparability_status": "state_code_stable"
                            if level == "state"
                            else "requires_crosswalk",
                        }
                    )
                result = conn.execute(
                    insert(Territory).returning(Territory.id, Territory.official_code), payload
                )
                territory_ids.update({row.official_code: row.id for row in result})
            copy_rows(
                conn,
                ParticipationRecord.__tablename__,
                ["source_id", "election_id", "territory_id", *COUNT_MAPPING.values()],
                (
                    (
                        source_id,
                        election_id,
                        territory_ids[official_code(row)],
                        *(row[c] for c in COUNTS),
                    )
                    for row in totals.iter_rows(named=True)
                ),
            )
            copy_rows(
                conn,
                DemographicParticipation.__tablename__,
                ["territory_id", "dimension", "category", *COUNT_MAPPING.values()],
                (
                    (
                        territory_ids[official_code(row)],
                        row["dimension"],
                        row["category"],
                        *(row[c] for c in COUNTS),
                    )
                    for row in demographic.iter_rows(named=True)
                ),
            )
            observed = conn.execute(
                select(*(func.sum(getattr(ParticipationRecord, c)) for c in COUNT_MAPPING.values()))
                .join(Territory, Territory.id == ParticipationRecord.territory_id)
                .where(
                    ParticipationRecord.source_id == source_id, Territory.territory_type == "state"
                )
            ).one()
            if tuple(observed) != tuple(quality["totals"][c] for c in COUNTS):
                raise DataQualityError("Los totales en Supabase no coinciden con los originales")

            result = {
                "year": year,
                "status": "completed",
                "source_id": source_id,
                "raw_rows": quality["raw_rows"],
                "territories": totals.height,
                "demographic_rows": demographic.height,
                "totals": quality["totals"],
            }
            conn.execute(
                update(IngestionRun)
                .where(IngestionRun.id == run_id)
                .values(
                    status="completed",
                    finished_at=datetime.now(UTC),
                    report=result,
                )
            )
        return result
    finally:
        engine.dispose()
