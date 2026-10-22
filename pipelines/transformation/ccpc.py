"""Validación estricta y agregación de los CSV CCPC inspeccionados del INE."""

import hashlib
import json
import zipfile
from datetime import datetime
from pathlib import Path

import polars as pl

PIPELINE_VERSION = "ccpc-v1"
COLUMNS = [
    "AELEC",
    "FELECCION",
    "EDOCVE",
    "EDONOM",
    "MPIOCVE",
    "MPIONOM",
    "SECCION",
    "TIPOSEC",
    "DEF",
    "DEL",
    "SEXO",
    "EDAD",
    "LN",
    "SV",
    "NV",
    "NS",
]
COUNTS = ["LN", "SV", "NV", "NS"]
KEY = ["EDOCVE", "MPIOCVE", "SECCION", "SEXO", "EDAD"]
DATES = {
    2009: "2009-07-05",
    2012: "2012-07-01",
    2015: "2015-06-07",
    2018: "2018-07-01",
    2021: "2021-06-06",
    2024: "2024-06-02",
}


class DataQualityError(ValueError):
    """Los registros se conservan; la carga se bloquea hasta revisar el problema."""


def age_band() -> pl.Expr:
    return (
        pl.when(pl.col("EDAD") < 25)
        .then(pl.lit("18-24"))
        .when(pl.col("EDAD") < 35)
        .then(pl.lit("25-34"))
        .when(pl.col("EDAD") < 45)
        .then(pl.lit("35-44"))
        .when(pl.col("EDAD") < 60)
        .then(pl.lit("45-59"))
        .otherwise(pl.lit("60+"))
    )


def validate(frame: pl.DataFrame, year: int) -> tuple[pl.DataFrame, dict]:
    if frame.columns != COLUMNS:
        raise DataQualityError(f"Esquema inesperado: {frame.columns}")
    if frame.is_empty():
        raise DataQualityError("CSV vacío")
    required = [name for name in COLUMNS if name != "DEL"]
    if any(frame[name].null_count() for name in required):
        raise DataQualityError("Valores nulos en campos obligatorios")
    try:
        frame = frame.with_columns(
            pl.col("AELEC", "EDOCVE", "MPIOCVE", "SECCION", "SEXO", "EDAD", *COUNTS).cast(
                pl.Int64, strict=True
            )
        )
    except pl.exceptions.PolarsError as exc:
        raise DataQualityError("Campo numérico inválido") from exc
    # El ZIP 2024 usa mes/día/año; los anteriores usan día/mes/año.
    date_format = "%m/%d/%Y" if year == 2024 else "%d/%m/%Y"
    expected = datetime.fromisoformat(DATES[year]).date()
    try:
        dates = {
            datetime.strptime(value, date_format).date()
            for value in frame["FELECCION"].unique().to_list()
        }
    except ValueError as exc:
        raise DataQualityError("Fecha no interpretable") from exc
    errors = {
        "wrong_year": frame.filter(pl.col("AELEC") != year).height,
        "invalid_state": frame.filter(~pl.col("EDOCVE").is_between(1, 32)).height,
        "invalid_municipality": frame.filter(pl.col("MPIOCVE") < 1).height,
        "invalid_section": frame.filter(pl.col("SECCION") < 1).height,
        "invalid_age": frame.filter(pl.col("EDAD") < 18).height,
        "invalid_sex": frame.filter(
            ~pl.col("SEXO").is_in([0, 1, 2] if year == 2024 else [0, 1])
        ).height,
        "invalid_section_type": frame.filter(~pl.col("TIPOSEC").is_in(["U", "M", "R"])).height,
        "negative_counts": frame.filter(pl.any_horizontal(pl.col(COUNTS) < 0)).height,
        "inconsistent_counts": frame.filter(
            pl.col("LN") != pl.col("SV") + pl.col("NV") + pl.col("NS")
        ).height,
        "duplicate_keys": frame.select(pl.struct(KEY).is_duplicated().sum()).item(),
        "wrong_date": int(dates != {expected}),
    }
    if any(errors.values()):
        raise DataQualityError(json.dumps(errors))
    return frame, {
        "rows": frame.height,
        "totals": frame.select(pl.col(COUNTS).sum()).row(0, named=True),
        "missing_local_district": frame["DEL"].null_count(),
        "age_min": frame["EDAD"].min(),
        "age_max": frame["EDAD"].max(),
        "sex_codes": sorted(frame["SEXO"].unique().to_list()),
        "dates_in_source": sorted(frame["FELECCION"].unique().to_list()),
        "checks": errors,
    }


def aggregate(frame: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Conservar totales y márgenes separados de sexo, edad y tipo de sección."""
    frame = frame.with_columns(
        pl.col("EDOCVE").cast(pl.String).str.zfill(2).alias("state_code"),
        pl.col("MPIOCVE").cast(pl.String).str.zfill(3).alias("municipality_code"),
        age_band().alias("age_band"),
    )
    totals, demographics = [], []
    for level, names in (
        ("state", ["state_code", "EDONOM"]),
        ("municipality", ["state_code", "municipality_code", "MPIONOM"]),
    ):
        grouped = frame.group_by(names).agg(pl.col(COUNTS).sum())
        grouped = grouped.rename({"EDONOM" if level == "state" else "MPIONOM": "name"})
        if level == "state":
            grouped = grouped.with_columns(pl.lit("").alias("municipality_code"))
        grouped = grouped.with_columns(pl.lit(level).alias("territory_type"))
        totals.append(
            grouped.select("territory_type", "state_code", "municipality_code", "name", *COUNTS)
        )
        keys = ["state_code"] if level == "state" else ["state_code", "municipality_code"]
        for dimension, column in (
            ("sex", "SEXO"),
            ("age_band", "age_band"),
            ("section_type", "TIPOSEC"),
        ):
            d = frame.group_by([*keys, column]).agg(pl.col(COUNTS).sum())
            d = d.rename({column: "category"}).with_columns(
                pl.col("category").cast(pl.String),
                pl.lit(dimension).alias("dimension"),
                pl.lit(level).alias("territory_type"),
            )
            if level == "state":
                d = d.with_columns(pl.lit("").alias("municipality_code"))
            demographics.append(
                d.select(
                    "territory_type",
                    "state_code",
                    "municipality_code",
                    "dimension",
                    "category",
                    *COUNTS,
                )
            )
    return pl.concat(totals), pl.concat(demographics)


def prepare(root: Path, year: int) -> dict:
    source_dir = root / "data/raw/ccpc" / str(year)
    output = root / "data/processed/ccpc" / str(year)
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "year": year,
        "pipeline_version": PIPELINE_VERSION,
        "status": "validating",
        "files": [],
    }
    try:
        metadata = json.loads((source_dir / "inventory.json").read_text(encoding="utf-8"))
        path = source_dir / "original.zip"
        with path.open("rb") as f:
            checksum = hashlib.file_digest(f, "sha256").hexdigest()
        if checksum != metadata["sha256"]:
            raise DataQualityError("El checksum del ZIP cambió; repetir inventario y revisión")
        report["source_sha256"] = checksum
        totals, demographics, states = [], [], set()
        with zipfile.ZipFile(path) as archive:
            csv_files = sorted(name for name in archive.namelist() if name.lower().endswith(".csv"))
            if len(csv_files) != 32:
                raise DataQualityError(f"Se esperaban 32 CSV; se encontraron {len(csv_files)}")
            for name in csv_files:
                with archive.open(name) as f:
                    frame = pl.read_csv(f, infer_schema=False, encoding="utf8")
                try:
                    frame, quality = validate(frame, year)
                    codes = frame["EDOCVE"].unique().to_list()
                    if len(codes) != 1 or codes[0] in states:
                        raise DataQualityError("Entidad duplicada o más de una entidad en un CSV")
                    states.add(codes[0])
                    t, d = aggregate(frame)
                    totals.append(t)
                    demographics.append(d)
                    report["files"].append({"member": name, **quality})
                except DataQualityError as exc:
                    report["files"].append({"member": name, "error": str(exc)})
                    raise
        if states != set(range(1, 33)):
            raise DataQualityError("La cobertura no contiene las 32 entidades")
        total = pl.concat(totals).sort("territory_type", "state_code", "municipality_code")
        demo = pl.concat(demographics).sort(
            "territory_type", "state_code", "municipality_code", "dimension", "category"
        )
        keys = ["territory_type", "state_code", "municipality_code"]
        if total.select(pl.struct(keys).is_duplicated().sum()).item():
            raise DataQualityError("Un territorio tiene nombres distintos dentro del mismo año")
        for dimension in ("sex", "age_band", "section_type"):
            margins = (
                demo.filter(pl.col("dimension") == dimension)
                .group_by(keys)
                .agg(pl.col(COUNTS).sum())
            )
            check = total.join(margins, on=keys, suffix="_margin")
            if (
                check.height != total.height
                or check.filter(
                    pl.any_horizontal([pl.col(c) != pl.col(f"{c}_margin") for c in COUNTS])
                ).height
            ):
                raise DataQualityError("Los márgenes demográficos no reconcilian con los totales")
        total.write_parquet(output / "territories.parquet")
        demo.write_parquet(output / "demographics.parquet")
        report.update(
            status="validated",
            raw_rows=sum(f["rows"] for f in report["files"]),
            territories=total.height,
            demographic_rows=demo.height,
            totals=total.filter(pl.col("territory_type") == "state")
            .select(pl.col(COUNTS).sum())
            .row(0, named=True),
            artifacts={},
        )
        for filename in ("territories.parquet", "demographics.parquet"):
            with (output / filename).open("rb") as f:
                report["artifacts"][filename] = hashlib.file_digest(f, "sha256").hexdigest()
    except Exception as exc:
        report.update(status="rejected", error=str(exc))
        raise
    finally:
        (output / "quality.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    return report
