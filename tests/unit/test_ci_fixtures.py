import io
import json
import tarfile

import pytest

from app.ml.training import verify_manifest
from scripts import ci_fixtures


def test_shipped_fixtures_restore_with_valid_model_and_demo_hashes(tmp_path):
    ci_fixtures.restore(tmp_path)
    report = json.loads(
        (ci_fixtures.ROOT / "docs/phase4_metrics.json").read_text(encoding="utf-8")
    )
    assert verify_manifest(tmp_path / "artifacts/models" / report["run_id"])["run_id"] == (
        report["run_id"]
    )
    manifest = json.loads((tmp_path / "data/demo/manifest.json").read_text(encoding="utf-8"))
    assert ci_fixtures.sha256(tmp_path / "data/demo/snapshot.jsonl.gz") == manifest["sha256"]
    ci_fixtures.restore(tmp_path)


def test_restore_does_not_overwrite_existing_local_data(tmp_path):
    target = tmp_path / "data/demo/manifest.json"
    target.parent.mkdir(parents=True)
    target.write_text("local data")
    with pytest.raises(ValueError, match="No se sobrescribe"):
        ci_fixtures.restore(tmp_path)
    assert target.read_text() == "local data"


@pytest.mark.parametrize("name", ["data/demo/../../.env", "../escape", "other/file"])
def test_restore_rejects_paths_outside_fixture_directories(monkeypatch, tmp_path, name):
    archive = tmp_path / "malformed.tar.gz"
    with tarfile.open(archive, "w:gz") as stream:
        info = tarfile.TarInfo(name)
        info.size = 4
        stream.addfile(info, io.BytesIO(b"test"))
    archive.with_suffix(".gz.sha256").write_text(ci_fixtures.sha256(archive))
    monkeypatch.setattr(ci_fixtures, "ARCHIVE", archive)
    with pytest.raises(ValueError, match="Ruta o tipo"):
        ci_fixtures.restore(tmp_path / "checkout")
    assert not (tmp_path / "checkout/.env").exists()


def test_restore_rejects_corruption_before_writing_files(monkeypatch, tmp_path):
    archive = tmp_path / "corrupt.tar.gz"
    archive.write_bytes(b"altered")
    archive.with_suffix(".gz.sha256").write_text("0" * 64)
    monkeypatch.setattr(ci_fixtures, "ARCHIVE", archive)
    with pytest.raises(ValueError, match="SHA-256"):
        ci_fixtures.restore(tmp_path / "checkout")
    assert not (tmp_path / "checkout").exists()
