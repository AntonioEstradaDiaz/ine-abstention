"""Exportar la procedencia de las fuentes CCPC del paquete de demo a un manifiesto versionado.

Lee `data_sources` de `data/demo/snapshot.jsonl.gz` y escribe `data/samples/ccpc_sources.json`.
El paquete se restaura con `scripts/ci_fixtures.py restore` (copia verificada que usa el CI).
No exporta rutas locales (`local_archive`) ni el inventario de miembros del ZIP.
"""

import argparse
import gzip
import json
from datetime import UTC
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "year",
    "institution",
    "dataset_name",
    "source_url",
    "landing_url",
    "retrieved_at",
    "checksum",
    "byte_size",
    "license_notes",
)


def http_date_to_iso(value: str | None) -> str | None:
    """Fecha del encabezado Last-Modified del servidor del INE, en ISO 8601 UTC."""
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def source_entry(row: dict) -> dict:
    report = row.get("quality_report") or {}
    return {
        **{field: row.get(field) for field in FIELDS},
        "published_at": http_date_to_iso((row.get("inventory") or {}).get("last_modified")),
        "validation_status": report.get("status"),
        "pipeline_version": report.get("pipeline_version"),
    }


def read_sources(bundle: Path) -> list[dict]:
    with gzip.open(bundle / "snapshot.jsonl.gz", "rt", encoding="utf-8") as stream:
        rows = [json.loads(line) for line in stream if line.strip()]
    sources = [source_entry(r["row"]) for r in rows if r.get("table") == "data_sources"]
    return sorted(sources, key=lambda s: s["year"])


def export(bundle: Path, output: Path) -> dict:
    sources = read_sources(bundle)
    if not sources:
        raise ValueError(f"El paquete {bundle} no contiene fuentes")
    output.write_text(
        json.dumps({"sources": sources}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return {"status": "exported", "sources": len(sources), "output": str(output)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, default=ROOT / "data/demo")
    parser.add_argument("--output", type=Path, default=ROOT / "data/samples/ccpc_sources.json")
    args = parser.parse_args()
    print(json.dumps(export(args.bundle, args.output)), flush=True)
