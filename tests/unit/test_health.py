from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.database import get_db
from app.main import app


def test_liveness() -> None:
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_readiness_failure_hides_database_details() -> None:
    class UnavailableSession:
        def execute(self, statement):
            raise OperationalError("private_connection_details", {}, Exception("secret"))

    app.dependency_overrides[get_db] = lambda: UnavailableSession()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json() == {"detail": "Database unavailable"}
    finally:
        app.dependency_overrides.clear()


def test_readiness_rejects_database_without_backend_schema():
    class Result:
        def __init__(self, value):
            self.value = value

        def scalar_one(self):
            return self.value

    class MissingSchema:
        def execute(self, statement, parameters=None):
            return Result("3.3" if parameters is None else False)

    app.dependency_overrides[get_db] = lambda: MissingSchema()
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["detail"] == "Database schema unavailable"
    finally:
        app.dependency_overrides.clear()
