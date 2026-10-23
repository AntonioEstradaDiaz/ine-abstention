from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import laboratory


def test_lab_report_is_available_without_a_database_and_does_not_train():
    app = FastAPI()
    app.include_router(laboratory.router, prefix="/api/v1")
    with TestClient(app) as client:
        response = client.get("/api/v1/ml/laboratory")
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        report = response.json()
        assert len(report["models"]) == 6
        assert all(len(m["forecasts"]) == 32 for m in report["models"])
        assert report["data"]["demographics_available"] is False
        assert client.post("/api/v1/ml/laboratory").status_code == 405


def test_missing_or_corrupt_report_is_not_replaced_by_invented_predictions(tmp_path, monkeypatch):
    app = FastAPI()
    app.include_router(laboratory.router, prefix="/api/v1")
    path = tmp_path / "report.json"
    monkeypatch.setattr(laboratory, "REPORT_PATH", path)
    with TestClient(app) as client:
        assert client.get("/api/v1/ml/laboratory").status_code == 404
        path.write_text('{"models": []}', encoding="utf-8")
        assert client.get("/api/v1/ml/laboratory").status_code == 503
