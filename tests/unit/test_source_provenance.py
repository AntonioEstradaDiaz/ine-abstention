import gzip
import json

import pytest

from scripts import export_source_provenance as provenance


def bundle(tmp_path, rows):
    with gzip.open(tmp_path / "snapshot.jsonl.gz", "wt", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row) + "\n")
    return tmp_path


def source(year, **extra):
    return {
        "table": "data_sources",
        "row": {
            "id": year - 2000,
            "year": year,
            "institution": "INE",
            "dataset_name": f"Conteos Censales de Participación Ciudadana {year}",
            "source_url": f"https://ine.mx/{year}.zip",
            "landing_url": "https://ine.mx/ccpc/",
            "retrieved_at": "2026-10-22T01:48:59.931533+00:00",
            "checksum": "a" * 64,
            "byte_size": 100,
            "license_notes": "Datos agregados públicos del INE.",
            "local_archive": f"C:/privado/{year}.zip",
            "inventory": {"last_modified": "Wed, 13 Aug 2025 04:38:59 GMT", "members": [{}]},
            "quality_report": {"status": "validated", "pipeline_version": "ccpc-v1"},
            **extra,
        },
    }


def test_http_date_becomes_utc_iso():
    assert provenance.http_date_to_iso("Wed, 13 Aug 2025 04:38:59 GMT") == "2025-08-13T04:38:59Z"
    assert provenance.http_date_to_iso("no es una fecha") is None
    assert provenance.http_date_to_iso(None) is None


def test_export_sorts_by_year_and_omits_local_paths(tmp_path):
    output = tmp_path / "sources.json"
    rows = [source(2024), {"table": "elections", "row": {"year": 2024}}, source(2009)]
    result = provenance.export(bundle(tmp_path, rows), output)
    assert result["sources"] == 2
    sources = json.loads(output.read_text(encoding="utf-8"))["sources"]
    assert [s["year"] for s in sources] == [2009, 2024]
    assert sources[0]["published_at"] == "2025-08-13T04:38:59Z"
    assert sources[0]["validation_status"] == "validated"
    assert sources[0]["pipeline_version"] == "ccpc-v1"
    for entry in sources:
        assert "local_archive" not in entry
        assert "inventory" not in entry
        assert "id" not in entry


def test_missing_metadata_is_null(tmp_path):
    output = tmp_path / "sources.json"
    rows = [source(2012, inventory={}, quality_report={})]
    provenance.export(bundle(tmp_path, rows), output)
    entry = json.loads(output.read_text(encoding="utf-8"))["sources"][0]
    assert entry["published_at"] is None
    assert entry["validation_status"] is None
    assert entry["pipeline_version"] is None


def test_bundle_without_sources_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="no contiene fuentes"):
        provenance.export(bundle(tmp_path, []), tmp_path / "sources.json")
