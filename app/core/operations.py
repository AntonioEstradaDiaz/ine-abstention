"""Request metrics and access checks. No raw queries, IPs, emails or tokens are logged."""

import logging
import re
import secrets
import time
from collections import Counter
from hmac import compare_digest
from threading import Lock

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import Settings

log = logging.getLogger("pulso.http")
REQUEST_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


class Telemetry:
    """Bounded in-process counters, per worker, reset on restart."""

    def __init__(self):
        self.started = time.monotonic()
        self.lock = Lock()
        self.statuses: Counter[str] = Counter()
        self.requests = 0
        self.in_flight = 0
        self.failed = 0

    def begin(self):
        with self.lock:
            self.requests += 1
            self.in_flight += 1

    def end(self, status: int):
        with self.lock:
            self.in_flight -= 1
            self.statuses[f"{status // 100}xx"] += 1
            if status >= 500:
                self.failed += 1

    def snapshot(self):
        with self.lock:
            return {
                "uptime_seconds": int(time.monotonic() - self.started),
                "requests_total": self.requests,
                "in_flight": self.in_flight,
                "server_errors_total": self.failed,
                "status_classes": dict(self.statuses),
                "scope": "process_worker",
            }


def allowed_internal(request: Request, settings: Settings) -> bool:
    token = settings.api_internal_token
    if token is None:
        return settings.environment.lower() not in {"production", "prod"}
    supplied = request.headers.get("x-pulso-internal-token", "")
    return compare_digest(supplied, token.get_secret_value())


def bucket(path: str) -> str:
    # Fixed-cardinality paths; never store route parameters or query values.
    if path == "/api/v1/health":
        return "health"
    if path.startswith("/api/v1/health/"):
        return "health_internal"
    if path.startswith("/api/v1/"):
        return "api"
    return "other"


def install_operations(app, settings: Settings):
    telemetry = Telemetry()
    app.state.telemetry = telemetry

    @app.middleware("http")
    async def operations(request: Request, call_next):
        request_id = request.state.request_id
        telemetry.begin()
        start = time.monotonic()
        status = 500
        try:
            # Public liveness alone is deliberately exempt.
            if request.url.path.startswith("/api/v1/") and request.url.path != "/api/v1/health":
                if not allowed_internal(request, settings):
                    response = JSONResponse(
                        status_code=401,
                        content={"detail": "Acceso interno no autorizado."},
                        headers={"Cache-Control": "no-store"},
                    )
                    status = response.status_code
                    return response
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            telemetry.end(status)
            duration = round((time.monotonic() - start) * 1000, 2)
            log.log(
                logging.WARNING if status >= 500 else logging.INFO,
                "request_completed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route_group": bucket(request.url.path),
                    "status_code": status,
                    "duration_ms": duration,
                },
            )

    # Attach request IDs to all outcomes, including security rejections.
    # Via middleware order: this wrapper is outside the operation handler.
    @app.middleware("http")
    async def request_id_header(request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if REQUEST_ID.fullmatch(incoming) else secrets.token_hex(12)
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response
