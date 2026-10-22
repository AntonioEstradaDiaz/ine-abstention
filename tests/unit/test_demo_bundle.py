import gzip
import json
from collections import Counter
from types import SimpleNamespace

import pytest

from scripts import demo_bundle


def test_restore_guard_rejects_remote_database_before_reading_files(monkeypatch, tmp_path):
    monkeypatch.setattr(
        demo_bundle,
        "get_settings",
        lambda: SimpleNamespace(
            migration_database_url=None,
            database_url="postgresql+psycopg://example:unused@remote.invalid/postgres",
            environment="local-demo",
        ),
    )
    with pytest.raises(ValueError, match="servidor local"):
        demo_bundle.restore_bundle(tmp_path)


def test_corrupted_bundle_is_rejected_before_database_connection(monkeypatch, tmp_path):
    monkeypatch.setattr(
        demo_bundle,
        "get_settings",
        lambda: SimpleNamespace(
            migration_database_url=None,
            database_url="postgresql+psycopg://example:unused@localhost/postgres",
            environment="local-demo",
        ),
    )
    (tmp_path / "snapshot.jsonl.gz").write_bytes(b"altered")
    (tmp_path / "manifest.json").write_text(
        json.dumps({"format": "ine-demo-v1", "sha256": "0" * 64})
    )
    with pytest.raises(ValueError, match="alterado"):
        demo_bundle.restore_bundle(tmp_path)


@pytest.mark.skipif(
    not (demo_bundle.ROOT / "data/demo/manifest.json").exists(),
    reason="Export official demo bundle first",
)
def test_official_snapshot_hash_keys_relations_and_counts():
    directory = demo_bundle.ROOT / "data/demo"
    manifest = json.loads((directory / "manifest.json").read_text())
    assert demo_bundle.digest(directory / "snapshot.jsonl.gz") == manifest["sha256"]
    counts, identifiers = Counter(), {}
    with gzip.open(directory / "snapshot.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            record = json.loads(line)
            table, row = record["table"], record["row"]
            assert row["id"] not in identifiers.setdefault(table, set())
            identifiers[table].add(row["id"])
            counts[table] += 1
            if table in ("participation_records", "demographic_participation"):
                assert row["territory_id"] in identifiers["territories"]
                assert (
                    row["nominal_list"]
                    == row["voter_count"] + row["nonvoter_count"] + row["unspecified_count"]
                )
                assert (
                    min(
                        row[c]
                        for c in (
                            "nominal_list",
                            "voter_count",
                            "nonvoter_count",
                            "unspecified_count",
                        )
                    )
                    >= 0
                )
                assert "abstention_rate" not in row  # La base vuelve a calcular columnas generadas.
            if table == "territories" and row["parent_id"] is not None:
                assert row["parent_id"] in identifiers[table]
    assert dict(counts) == manifest["rows"]
    assert counts["territorial_predictions"] == 32
