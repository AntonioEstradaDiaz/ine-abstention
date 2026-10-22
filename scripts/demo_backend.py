"""Demostración integral HTTP; falla si falta un endpoint o se rompe una invariancia."""

import argparse
import json
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def run(api: str) -> dict:
    checks = []

    def call(path, payload=None, expected=200):
        request = Request(
            api.rstrip("/") + "/api/v1" + path,
            data=None if payload is None else json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        start = time.perf_counter()
        try:
            response = urlopen(request, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            body = json.load(response)
            status = response.code
        checks.append(
            {
                "method": request.get_method(),
                "path": path,
                "status": status,
                "elapsed_ms": round((time.perf_counter() - start) * 1000, 2),
            }
        )
        accepted = (expected,) if isinstance(expected, int) else expected
        if status not in accepted:
            raise ValueError(f"{request.get_method()} {path}: {status}, esperado {accepted}")
        return body

    call("/health")
    call("/health/ready")
    sources = call("/data-sources")
    elections = call("/elections")
    assert sources["total"] == len(elections) == 6
    territories = call("/territories?year=2024")
    assert territories["total"] == 32
    territory = territories["items"][0]
    assert call(f"/territories/{territory['id']}")["state_code"] == territory["state_code"]
    call("/territories?territory_type=municipality&state_code=17&year=2024&limit=2")
    call("/participation/history?state_code=17&limit=6")
    statistics = call("/statistics/summary?year=2024")
    call("/statistics/trends?state_code=17")
    call("/statistics/territories?territory_type=municipality&year=2024&state_code=17&limit=2")
    call("/statistics/demographics?dimension=sex&year=2024")
    predictions = call("/predictions")
    assert predictions["total"] == len(predictions["items"]) == 32
    run_id = predictions["forecast"]["id"]
    call(f"/predictions/{predictions['items'][0]['territory_id']}?run_id={run_id}")
    call("/models/metrics?run_id=" + predictions["forecast"]["provenance"]["model_run_id"])
    call("/risk/calibration?run_id=" + run_id)
    risk = call("/risk/summary?run_id=" + run_id)
    mapping = call("/risk/map?run_id=" + run_id)
    assert len(mapping["features"]) == 32
    assert all(feature["geometry"] is None for feature in mapping["features"])
    payload = {
        "name": "Demostración integrada: +3 pp",
        "forecast_run_id": run_id,
        "participation_change_pp": 3,
    }
    simulation = call("/simulations", payload, (200, 201))
    assert call("/simulations/" + simulation["id"]) == simulation
    assert call("/simulations", payload) == simulation
    call("/simulations?limit=2")
    for row in simulation["result"]["states"]:
        assert (
            abs(row["scenario"]["abstention_rate"] + row["scenario"]["participation_rate"] - 1)
            < 1e-12
        )
    call("/territories?state_code=99", expected=422)
    call("/territories/999999999", expected=404)
    call("/statistics/territories?territory_type=municipality&sort_by=trend_desc", expected=409)
    assert call("/predictions?run_id=" + run_id) == predictions
    return {
        "status": "passed",
        "api_url": api,
        "checks": checks,
        "source_datasets": sources["total"],
        "elections": len(elections),
        "forecast_run_id": run_id,
        "risk_counts": risk["counts"],
        "simulation_id": simulation["id"],
        "scenario_summary": simulation["result"]["summary"],
        "statistics_2024": statistics,
        "limitations": [
            "Frozen official aggregates; ML retraining is a separate workflow",
            "No verified geometry; map features have null geometry",
            "Scenario changes are hypothetical, without causal interpretation",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/phase7_demo.json")
    args = parser.parse_args()
    result = run(args.api_url)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": result["status"],
                "http_checks": len(result["checks"]),
                "simulation_id": result["simulation_id"],
            }
        )
    )
