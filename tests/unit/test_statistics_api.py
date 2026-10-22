from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.database import get_db
from app.main import app


def test_empty_statistics_return_404_without_invented_results():
    class EmptyResult:
        def mappings(self):
            return []

    class EmptySession:
        def execute(self, statement):
            return EmptyResult()

    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            for path in (
                "summary",
                "summary?year=2024",
                "trends",
                "trends?through_year=2018",
                "territories",
                "territories?year=2012",
                "demographics?dimension=sex&year=2024",
            ):
                assert client.get(f"/api/v1/statistics/{path}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_database_errors_are_503_without_connection_secrets():
    class BrokenSession:
        def execute(self, statement):
            raise OperationalError("private_statement", {}, Exception("secret_password"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    try:
        with TestClient(app) as client:
            result = client.get("/api/v1/statistics/summary")
        assert result.status_code == 503
        assert result.json() == {"detail": "Database unavailable"}
    finally:
        app.dependency_overrides.clear()
