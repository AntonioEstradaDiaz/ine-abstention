import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import get_engine
from app.db.models import DataSource
from app.main import app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


def test_national_totals_match_independent_ingestion_report():
    with get_engine().connect() as connection:
        expected = connection.execute(
            select(DataSource.quality_report).where(DataSource.year == 2024)
        ).scalar_one()["totals"]
    with TestClient(app) as client:
        response = client.get("/api/v1/statistics/summary?year=2024")
    assert response.status_code == 200
    body = response.json()
    assert body["rate_denominator"] == "SV + NV; NS excluded"
    assert len(body["items"]) == 1
    actual = body["items"][0]
    for source, field in (
        ("LN", "nominal_list"),
        ("SV", "voter_count"),
        ("NV", "nonvoter_count"),
        ("NS", "unspecified_count"),
    ):
        assert actual[field] == expected[source]
    assert actual["territory_count"] == 32
    assert actual["previous_comparable_year"] == 2018
    assert actual["abstention_rate"] == pytest.approx(
        expected["NV"] / (expected["SV"] + expected["NV"])
    )


def test_real_trends_cutoff_and_territorial_rankings():
    with TestClient(app) as client:
        response = client.get("/api/v1/statistics/trends?state_code=17")
        assert response.status_code == 200
        assert {s["election_type"] for s in response.json()["series"]} == {
            "presidential",
            "midterm",
        }
        assert all(s["metrics"]["valid_elections"] == 3 for s in response.json()["series"])
        early = client.get("/api/v1/statistics/trends?state_code=17&through_year=2018").json()
        assert all(s["metrics"]["abstention_slope_pp_per_year"] is None for s in early["series"])
        response = client.get("/api/v1/statistics/territories?year=2024&limit=2")
        assert response.status_code == 200
        page = response.json()
        assert page["total"] == 32
        assert len(page["items"]) == 2
        assert page["items"][0]["abstention_rate"] >= page["items"][1]["abstention_rate"]
        assert page["items"][0]["history"]["years"] == [2012, 2018, 2024]


def test_real_municipal_statistics_are_snapshots_only():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/statistics/territories?territory_type=municipality&state_code=17"
        )
        assert response.status_code == 200
        items = response.json()["items"]
        assert items
        assert all(i["history"] is None for i in items)
        assert all(i["persistent_low_participation"] is None for i in items)
        assert all(i["gap_vs_state_abstention_pp"] is not None for i in items)
        assert (
            client.get(
                "/api/v1/statistics/territories?territory_type=municipality&sort_by=trend_desc"
            ).status_code
            == 409
        )


def test_demographic_margins_reconcile_without_double_counting():
    with TestClient(app) as client:
        total = client.get("/api/v1/statistics/summary?year=2024").json()["items"][0]
        for dimension in ("sex", "age_band", "section_type"):
            response = client.get(
                f"/api/v1/statistics/demographics?year=2024&dimension={dimension}"
            )
            assert response.status_code == 200
            for column in ("nominal_list", "voter_count", "nonvoter_count", "unspecified_count"):
                assert sum(item[column] for item in response.json()["items"]) == total[column]


def test_invalid_statistics_filters_fail_validation():
    with TestClient(app) as client:
        for path in (
            "summary?year=2010",
            "trends?state_code=99",
            "trends?election_type=unknown",
            "territories?limit=501",
            "demographics?dimension=unsupported",
        ):
            assert client.get(f"/api/v1/statistics/{path}").status_code == 422
