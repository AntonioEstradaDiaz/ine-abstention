"""Failure-closed internal API, operational telemetry and safe request IDs."""

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import JsonFormatter
from app.core.operations import REQUEST_ID, install_operations


def settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_production_requires_secret_and_no_debug() -> None:
    with pytest.raises(ValidationError, match="API_INTERNAL_TOKEN"):
        settings(environment="production", api_internal_token=None)
    with pytest.raises(ValidationError, match="DEBUG"):
        settings(environment="production", api_internal_token="a" * 40, debug=True)
    with pytest.raises(ValidationError, match="Wildcard CORS"):
        settings(
            environment="production",
            api_internal_token="a" * 40,
            cors_origins=["*"],
        )


def test_short_token_rejected_even_in_demo() -> None:
    with pytest.raises(ValidationError, match="32 characters"):
        settings(environment="local-demo", api_internal_token="short")


def test_production_denies_direct_requests_without_token() -> None:
    application = FastAPI()
    install_operations(application, settings(environment="production", api_internal_token="t" * 40))

    @application.get("/api/v1/health")
    def alive():
        return {"status": "ok"}

    @application.get("/api/v1/private")
    def private():
        return {"private": "ok"}

    @application.get("/api/v1/health/metrics")
    def metrics():
        return application.state.telemetry.snapshot()

    with TestClient(application) as client:
        liveness = client.get("/api/v1/health")
        assert liveness.status_code == 200
        assert REQUEST_ID.fullmatch(liveness.headers["x-request-id"])
        assert client.get("/api/v1/private").status_code == 401
        assert client.get(
            "/api/v1/private",
            headers={"x-pulso-internal-token": "incorrect"},
        ).status_code == 401
        assert client.get("/api/v1/health/metrics").status_code == 401
        accepted = client.get(
            "/api/v1/private",
            headers={"x-pulso-internal-token": "t" * 40, "x-request-id": "ops-check_123"},
        )
        assert accepted.status_code == 200
        assert accepted.headers["x-request-id"] == "ops-check_123"
        invalid = client.get(
            "/api/v1/private",
            headers={"x-pulso-internal-token": "t" * 40, "x-request-id": "bad id!"},
        )
        assert REQUEST_ID.fullmatch(invalid.headers["x-request-id"])
        assert invalid.headers["x-request-id"] != "bad id!"
        met = client.get("/api/v1/health/metrics", headers={"x-pulso-internal-token": "t" * 40})
        assert met.status_code == 200
        payload = met.json()
        assert payload["requests_total"] >= 6
        assert payload["scope"] == "process_worker"
        assert payload["status_classes"]["4xx"] >= 3
        assert "t" * 40 not in json.dumps(payload)
        assert "Cache-Control" in met.headers


def test_local_demo_with_no_token_preserves_existing_ci() -> None:
    application = FastAPI()
    install_operations(application, settings(environment="local-demo", api_internal_token=None))

    @application.post("/api/v1/simulations")
    def simulation():
        return {"ok": True}

    with TestClient(application) as client:
        assert client.post("/api/v1/simulations").json() == {"ok": True}


def test_json_logs_have_bounded_fields() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord("pulso.http", logging.INFO, "", 0, "request_completed", (), None)
    record.request_id = "abc"
    record.method = "GET"
    record.route_group = "api"
    record.status_code = 200
    record.duration_ms = 1.5
    data = json.loads(formatter.format(record))
    assert data["route_group"] == "api"
    assert data["request_id"] == "abc"
    assert "access_token" not in data
