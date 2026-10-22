import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.config import get_settings
from app.core.database import get_engine
from app.db.models import DataSource, Election, ParticipationRecord, Territory
from app.main import app


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1")
def test_postgis_readiness() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json()["postgis_version"]


@pytest.mark.integration
@pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1")
def test_ingested_sources_and_history() -> None:
    """Exige una carga real completa: no confundir una base vacía con éxito."""
    with TestClient(app) as client:
        sources = client.get("/api/v1/data-sources")
        assert sources.status_code == 200
        assert sources.json()["total"] == 6
        history = client.get("/api/v1/participation/history?state_code=17&limit=2")
        assert history.status_code == 200
        body = history.json()
        assert body["total"] == 6
        assert len(body["items"]) == 2
        assert body["rates_denominator"] == "SV + NV; NS excluded"
        for item in body["items"]:
            denominator = item["voter_count"] + item["nonvoter_count"]
            assert item["abstention_rate"] == pytest.approx(item["nonvoter_count"] / denominator)
        assert client.get("/api/v1/participation/history?limit=501").status_code == 422
        assert client.get("/api/v1/participation/history?state_code=99").status_code == 422
    with get_engine().connect() as conn:
        assert conn.scalar(select(func.count()).select_from(DataSource)) == 6
        assert conn.scalar(select(func.count()).select_from(Election)) == 6
        assert conn.scalar(select(func.count()).select_from(ParticipationRecord)) > 14_000
        assert conn.scalar(select(func.count()).select_from(Territory)) > 14_000
        if get_settings().database_schema == "ine":
            assert not conn.scalar(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' AND "
                    "(has_schema_privilege(oid, 'ine', 'USAGE') OR "
                    "has_table_privilege(oid, 'ine.participation_records', 'SELECT')))"
                )
            )
