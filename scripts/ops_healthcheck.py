"""Scheduled readiness check with optional webhook. No secrets or URLs in messages."""
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def probe(url: str, token: str = "") -> bool:
    parsed = urlsplit(url)
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
    ):
        raise ValueError("Use HTTPS for remote monitoring")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Invalid monitor URL")
    if not parsed.path.endswith("/api/v1/health/ready"):
        raise ValueError("Monitoring requires the readiness endpoint")
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            **({"X-Pulso-Internal-Token": token} if token else {}),
        },
    )
    try:
        with urlopen(request, timeout=12) as response:
            if response.status != 200:
                return False
            content = response.read(16_384)
            payload = json.loads(content)
            return payload.get("status") == "ok" and payload.get("database") == "ok"
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
        return False


def alert(webhook: str, event: str) -> None:
    parsed = urlsplit(webhook)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Alert webhook must use HTTPS")
    body = json.dumps({"text": event}).encode("utf-8")
    request = Request(
        webhook, method="POST", data=body,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=10) as response:
        if response.status >= 300:
            raise ValueError("Alert delivery failed")


def main() -> int:
    target = os.environ.get("PULSO_HEALTH_URL", "")
    if not target:
        print("PULSO_HEALTH_URL not configured; no remote health claim.")
        return 0
    try:
        healthy = probe(target, os.environ.get("PULSO_INTERNAL_API_TOKEN", ""))
    except ValueError:
        print("Invalid monitoring configuration.", file=sys.stderr)
        return 2
    if healthy:
        print("PULSO readiness: healthy")
        return 0
    print("PULSO readiness: FAILED", file=sys.stderr)
    webhook = os.environ.get("PULSO_ALERT_WEBHOOK", "")
    if webhook:
        try:
            alert(
                webhook,
                "PULSO ALERT: production readiness failed. Inspect the monitoring job.",
            )
            print("Alert webhook submitted")
        except (ValueError, HTTPError, URLError, TimeoutError, OSError):
            print("Alert delivery failed; check webhook configuration.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
