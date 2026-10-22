import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_engine
from app.db.models import ModelVersion
from app.main import app

ROOT = Path(__file__).resolve().parents[2]
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION") != "1" or os.getenv("RUN_FORECAST_INTEGRATION") != "1",
        reason="Set RUN_INTEGRATION=1 and RUN_FORECAST_INTEGRATION=1 after materializing forecasts",
    ),
]


def test_live_predictions_explanations_calibration_and_filters():
    report = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
    with TestClient(app) as client:
        response = client.get("/api/v1/predictions", params={"run_id": report["id"]})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["forecast"]["fingerprint"] == report["fingerprint"]
        assert body["total"] == len(body["items"]) == 32
        for prediction, expected in zip(body["items"], report["predictions"], strict=True):
            assert prediction == expected
            explanation = prediction["explanation"]
            assert explanation["reference_year"] == 2021
            assert explanation["nonvoter_count"] / (
                explanation["nonvoter_count"] + explanation["voter_count"]
            ) == pytest.approx(prediction["predicted"])
            assert 0 <= prediction["lower"] <= prediction["predicted"] <= prediction["upper"] <= 1
            assert max(prediction["lineage"]["feature_source_years"]) < 2027
            assert prediction["uncertainty"]["coverage_guaranteed"] is False
            assert prediction["uncertainty"]["high_risk_probability"] is None
        first = body["items"][0]
        detail = client.get(f"/api/v1/predictions/{first['territory_id']}").json()
        assert detail["prediction"] == first
        filtered = client.get("/api/v1/predictions?state_code=01").json()
        assert filtered["total"] == 1 and filtered["items"][0] == first
        page = client.get("/api/v1/predictions?limit=2&offset=1").json()
        assert page["total"] == 32 and page["items"] == body["items"][1:3]
        summary = client.get("/api/v1/risk/summary").json()
        assert sum(summary["counts"].values()) == summary["total_states"] == 32
        for risk, count in summary["counts"].items():
            group = client.get("/api/v1/predictions", params={"risk_level": risk}).json()
            assert group["total"] == count
            assert all(r["risk_level"] == risk for r in group["items"])
        calibration = client.get("/api/v1/risk/calibration").json()
        assert calibration["calibration"] == report["calibration"]
        for query in ("state_code=33", "limit=0", "offset=-1", "risk_level=red"):
            assert client.get("/api/v1/predictions?" + query).status_code == 422
        assert client.get("/api/v1/predictions?target_year=2030").status_code == 404
        assert client.get("/api/v1/predictions/99999999").status_code == 404
        assert client.get("/api/v1/predictions?run_id=00000000000000000000").status_code == 404


def test_runtime_can_read_forecasts_but_has_no_write_privileges():
    with get_engine().connect() as connection:
        for table in ("forecast_runs", "territorial_predictions"):
            # Referir el esquema configurado explícitamente, sin depender de search_path.
            schema = get_settings().database_schema
            privileges = connection.execute(
                text(
                    "SELECT has_table_privilege(current_user, :table, 'SELECT'), "
                    "has_table_privilege(current_user, :table, 'INSERT'), "
                    "has_table_privilege(current_user, :table, 'UPDATE'), "
                    "has_table_privilege(current_user, :table, 'DELETE'), "
                    "EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon' "
                    "AND has_table_privilege(oid, :table, 'SELECT')), "
                    "EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated' "
                    "AND has_table_privilege(oid, :table, 'SELECT'))"
                ),
                {"table": f"{schema}.{table}"},
            ).one()
            assert tuple(privileges) == (True, False, False, False, False, False)


def selected_metadata():
    with Session(get_engine()) as db:
        report = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
        model = db.scalar(select(ModelVersion).where(ModelVersion.id == report["model_version_id"]))
        return {c.name: getattr(model, c.name) for c in model.__table__.columns}


def test_inference_reproduces_materialized_scenario_with_registered_weights():
    pytest.importorskip("lightgbm")
    from app.ml.forecasting import generate

    expected = json.loads((ROOT / "docs/phase5_results.json").read_text(encoding="utf-8"))
    assert generate(ROOT, selected_metadata(), 2027, "midterm") == expected


def test_inference_rejects_modified_registered_hash_before_loading_weights():
    pytest.importorskip("lightgbm")
    from app.ml.forecasting import generate

    model = selected_metadata()
    for artifact in model["artifact_manifest"].values():
        artifact["sha256"] = "0" * 64
    with pytest.raises(ValueError, match="artefacto no coincide"):
        generate(ROOT, model, 2027, "midterm")


def test_inference_rejects_observed_target_year():
    pytest.importorskip("lightgbm")
    from app.ml.forecasting import generate

    with pytest.raises(ValueError, match="debe ser futura"):
        generate(ROOT, selected_metadata(), 2024, "presidential")
