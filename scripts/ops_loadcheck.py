"""Bounded synthetic concurrency check. Not an external penetration test."""
import argparse
import json
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def check_one(url: str, token: str = "") -> tuple[int, float]:
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Pulso-Internal-Token"] = token
    start = time.monotonic()
    try:
        with urlopen(Request(url, headers=headers), timeout=15) as response:
            response.read(2048)
            return response.status, (time.monotonic() - start) * 1000
    except HTTPError as exc:
        return exc.code, (time.monotonic() - start) * 1000
    except (OSError, URLError, TimeoutError):
        return 0, (time.monotonic() - start) * 1000


def run(url: str, requests: int, workers: int, token: str = "") -> dict:
    if not (1 <= requests <= 300 and 1 <= workers <= 20 and workers <= requests):
        raise ValueError("Use 1–300 requests and at most 20 concurrent workers")
    parsed = urlsplit(url)
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Invalid URL")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    ):
        raise ValueError("Use HTTPS for remote targets")
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(check_one, url, token) for _ in range(requests)]
        results = [future.result() for future in as_completed(futures)]
    latencies = sorted(ms for _, ms in results)
    failures = sum(status < 200 or status >= 400 for status, _ in results)
    p95 = latencies[max(0, int(len(latencies) * 0.95 + 0.999) - 1)]
    return {
        "requests": requests,
        "concurrency": workers,
        "success": requests - failures,
        "failed": failures,
        "p50_ms": round(statistics.median(latencies), 2),
        "p95_ms": round(p95, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--requests", type=int, default=30)
    parser.add_argument("--workers", type=int, default=5)
    parser.add_argument("--max-errors", type=int, default=0)
    args = parser.parse_args()
    report = run(args.url, args.requests, args.workers, os.environ.get("PULSO_INTERNAL_API_TOKEN", ""))
    print(json.dumps(report))
    return int(report["failed"] > args.max_errors)


if __name__ == "__main__":
    raise SystemExit(main())
