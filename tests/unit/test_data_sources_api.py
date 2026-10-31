from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.core.database import get_db
from app.db.models import DataSource
from app.main import app


def source(**extra):
    values = dict(
        id=6,
        institution="INE",
        dataset_name="Conteos Censales de Participación Ciudadana 2024",
        year=2024,
        source_url="https://ine.mx/2024.zip",
        landing_url="https://ine.mx/ccpc/",
        retrieved_at=datetime(2026, 10, 22, 1, 49, tzinfo=UTC),
        checksum="c" * 64,
        byte_size=82419841,
        local_archive="C:/privado/2024.zip",
        license_notes="Datos agregados públicos del INE.",
        inventory={"last_modified": "Wed, 13 Aug 2025 04:38:59 GMT"},
        quality_report={"status": "validated", "pipeline_version": "ccpc-v1"},
    )
    return DataSource(**(values | extra))


def test_provenance_properties_and_missing_values():
    complete = source()
    assert complete.published_at == datetime(2025, 8, 13, 4, 38, 59, tzinfo=UTC)
    assert complete.validation_status == "validated"
    assert complete.pipeline_version == "ccpc-v1"
    empty = source(inventory={"last_modified": "no es una fecha"}, quality_report={})
    assert empty.published_at is None
    assert empty.validation_status is None
    assert empty.pipeline_version is None


def test_data_sources_api_exposes_provenance_without_local_paths():
    class Rows:
        def all(self):
            return [source()]

    class Session:
        def scalar(self, statement):
            return 1

        def scalars(self, statement):
            return Rows()

    app.dependency_overrides[get_db] = lambda: Session()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/data-sources")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["published_at"].startswith("2025-08-13T04:38:59")
    assert item["validation_status"] == "validated"
    assert item["pipeline_version"] == "ccpc-v1"
    assert item["checksum"] == "c" * 64
    assert "local_archive" not in item
    assert "inventory" not in item
    assert "quality_report" not in item
