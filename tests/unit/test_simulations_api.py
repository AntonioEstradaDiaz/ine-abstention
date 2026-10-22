from fastapi.testclient import TestClient

from app.core.database import get_db
from app.main import app


def test_invalid_parameters_and_missing_scenarios():
    class EmptySession:
        def scalar(self, statement):
            return None

        def get(self, model, identifier):
            return None

    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            assert (
                client.post("/api/v1/simulations", json={"participation_change_pp": 3}).status_code
                == 404
            )
            assert client.get("/api/v1/simulations/" + "0" * 64).status_code == 404
            assert client.get("/api/v1/simulations/invalid").status_code == 422
            for body in ({}, {"participation_change_pp": "3"}, {"participation_change_pp": 101}):
                assert client.post("/api/v1/simulations", json=body).status_code == 422
            for invalid in ("NaN", "Infinity", "-Infinity"):
                response = client.post(
                    "/api/v1/simulations",
                    content='{"participation_change_pp":' + invalid + "}",
                    headers={"Content-Type": "application/json"},
                )
                assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
