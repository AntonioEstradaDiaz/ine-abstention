from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app


def test_prediction_parameters_and_missing_forecast():
    class EmptySession:
        def scalar(self, statement):
            return None

    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            for route in ("/predictions", "/risk/calibration", "/risk/summary", "/predictions/1"):
                assert client.get("/api/v1" + route).status_code == 404
            for query in ("run_id=bad", "target_year=2024"):
                assert client.get("/api/v1/predictions?" + query).status_code == 422
    finally:
        app.dependency_overrides.clear()
