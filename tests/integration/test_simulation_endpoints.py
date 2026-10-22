import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import get_engine
from app.main import app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION") != "1" or os.getenv("RUN_SIMULATION_INTEGRATION") != "1",
        reason="Set RUN_INTEGRATION=1 and RUN_SIMULATION_INTEGRATION=1 after applying migrations",
    ),
]


def test_post_get_idempotence_pagination_and_unchanged_predictions():
    with TestClient(app) as client:
        original = client.get("/api/v1/predictions").json()
        payload = {
            "name": "Prueba de integración: +3 pp",
            "forecast_run_id": original["forecast"]["id"],
            "state_codes": ["01", "02"],
            "participation_change_pp": 3,
            "state_changes": [{"state_code": "02", "participation_change_pp": -2}],
        }
        first = client.post("/api/v1/simulations", json=payload)
        assert first.status_code in (200, 201), first.text
        body = first.json()
        assert body["result"]["parameters"]["target_year"] == 2027
        assert body["result"]["summary"]["selected_states"] == 2
        for state, expected in zip(body["result"]["states"], (3, -2), strict=True):
            assert state["applied_participation_change_pp"] == pytest.approx(expected)
            assert state["scenario"]["participation_rate"] + state["scenario"][
                "abstention_rate"
            ] == pytest.approx(1)
        assert client.get(first.headers["Location"]).json() == body
        replay = client.post("/api/v1/simulations", json=body["result"]["parameters"])
        assert replay.status_code == 200, replay.text
        assert replay.json() == body
        page = client.get(
            "/api/v1/simulations",
            params={"forecast_run_id": original["forecast"]["id"], "limit": 100},
        ).json()
        assert page["total"] >= 1
        assert any(item["id"] == body["id"] for item in page["items"])
        assert client.get("/api/v1/simulations?limit=1&offset=0").json()["limit"] == 1
        assert client.get("/api/v1/simulations?limit=0").status_code == 422
        assert client.get("/api/v1/simulations?forecast_run_id=invalid").status_code == 422
        assert client.get("/api/v1/simulations/" + "0" * 64).status_code == 404
        assert (
            client.post(
                "/api/v1/simulations", json={"participation_change_pp": 3, "target_year": 2030}
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/v1/simulations",
                json={
                    "participation_change_pp": 3,
                    "state_codes": ["01"],
                    "state_changes": [{"state_code": "02", "participation_change_pp": 3}],
                },
            ).status_code
            == 422
        )
        assert client.get("/api/v1/predictions").json() == original


def test_simulation_table_permissions_are_append_only_for_backend():
    table = f"{get_settings().database_schema}.simulation_runs"
    with get_engine().connect() as connection:
        privileges = connection.execute(
            text(
                "SELECT has_table_privilege(current_user, :table, 'SELECT'), "
                "has_table_privilege(current_user, :table, 'INSERT'), "
                "has_table_privilege(current_user, :table, 'UPDATE'), "
                "has_table_privilege(current_user, :table, 'DELETE'), "
                "EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' "
                "AND has_table_privilege(oid, :table, 'SELECT')), "
                "EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated' "
                "AND has_table_privilege(oid, :table, 'INSERT')), "
                "(SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(:table))"
            ),
            {"table": table},
        ).one()
        assert tuple(privileges) == (True, True, False, False, False, False, True)
