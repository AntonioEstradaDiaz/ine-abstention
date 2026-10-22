from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app


def test_empty_registry_is_404_and_invalid_identifier_is_422():
    class EmptySession:
        def scalar(self, statement):
            return None

    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            assert client.get("/api/v1/models/metrics").status_code == 404
            assert client.get("/api/v1/models/metrics?run_id=invalid").status_code == 422
    finally:
        app.dependency_overrides.clear()
