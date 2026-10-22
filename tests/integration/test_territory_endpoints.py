import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


def test_catalog_snapshots_pagination_and_detail():
    with TestClient(app) as client:
        states = client.get("/api/v1/territories?year=2024").json()
        assert states["total"] == 32
        assert {t["state_code"] for t in states["items"]} == {f"{i:02}" for i in range(1, 33)}
        first = states["items"][0]
        assert client.get(f"/api/v1/territories/{first['id']}").json() == first
        assert client.get("/api/v1/territories").json() == states
        page = client.get("/api/v1/territories?year=2024&limit=2&offset=1").json()
        assert page["items"] == states["items"][1:3]
        assert page["total"] == 32
        old = client.get("/api/v1/territories?year=2021&state_code=01").json()
        assert old["items"][0]["id"] != first["id"]
        municipalities = client.get(
            "/api/v1/territories?territory_type=municipality&year=2024&state_code=17"
        ).json()
        assert municipalities["total"] >= 30
        assert all(
            t["comparability_status"] == "requires_crosswalk" for t in municipalities["items"]
        )
        for query in ("year=2023", "state_code=33", "limit=501", "offset=-1"):
            assert client.get("/api/v1/territories?" + query).status_code == 422
        assert client.get("/api/v1/territories/999999999").status_code == 404


@pytest.mark.skipif(os.getenv("RUN_FORECAST_INTEGRATION") != "1", reason="Requires forecasts")
def test_risk_map_is_joinable_and_does_not_invent_geometries():
    with TestClient(app) as client:
        response = client.get("/api/v1/risk/map")
        assert response.status_code == 200
        body = response.json()
        predictions = client.get("/api/v1/predictions").json()
        assert body["type"] == "FeatureCollection"
        assert body["geometry_status"] == "unavailable"
        assert body["forecast_run_id"] == predictions["forecast"]["id"]
        assert len(body["features"]) == 32
        for feature, prediction in zip(body["features"], predictions["items"], strict=True):
            assert feature["geometry"] is None
            assert feature["properties"]["state_code"] == prediction["state_code"]
            assert feature["properties"]["risk_level"] == prediction["risk_level"]
        assert len(client.get("/api/v1/risk/map?state_code=17").json()["features"]) == 1
        assert client.get("/api/v1/risk/map?state_code=00").status_code == 422
        assert client.get("/api/v1/risk/map?target_year=2030").status_code == 404
