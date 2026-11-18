"""
Latency budget suite  (API_REGULATION.md §8.1 and §11.1)

For every GET endpoint: 5 warm-up calls, then 30 timed calls.
  p95 must be <= 300 ms, and no single call may exceed 400 ms.

Rollout:   LATENCY_MODE=warn  (default)  report only, CI stays green
Enforce:   LATENCY_MODE=fail             fail CI on any breach

Run against a seeded database with realistic volume, e.g.:
    LATENCY_MODE=fail pytest tests/test_latency_budget.py -s

Knobs: API_P95_MS (300), API_MAX_MS (400), LATENCY_SAMPLES (30), LATENCY_WARMUP (5)
Timings are measured in-process (no network), so they approximate the
server-side budget from the regulation.
"""
import os
import time

import pytest
from fastapi.testclient import TestClient

try:
    from api_regulation_helpers import auth_headers, discover_get_endpoints, enforce, load_app, percentile
except ImportError:  # tests/ is a package
    from tests.api_regulation_helpers import auth_headers, discover_get_endpoints, enforce, load_app, percentile

P95_BUDGET_MS = float(os.getenv("API_P95_MS", "300"))
MAX_BUDGET_MS = float(os.getenv("API_MAX_MS", "400"))
SAMPLES = int(os.getenv("LATENCY_SAMPLES", "30"))
WARMUP = int(os.getenv("LATENCY_WARMUP", "5"))

APP = load_app()
ENDPOINTS = discover_get_endpoints(APP)


@pytest.fixture(scope="module")
def client():
    with TestClient(APP) as c:  # runs startup/lifespan (e.g. DB pool)
        c.headers.update(auth_headers())
        yield c


@pytest.mark.parametrize("path", ENDPOINTS)
def test_endpoint_latency_budget(client, path):
    first = client.get(path)
    if first.status_code in (401, 403, 404, 405, 422):
        pytest.skip(f"{path} returned {first.status_code}; set API_TEST_TOKEN / API_HOT_ENDPOINTS to test it")
    assert first.status_code < 500, f"{path} returned {first.status_code} (server error)"

    for _ in range(WARMUP):
        client.get(path)

    timings = []
    for _ in range(SAMPLES):
        t0 = time.perf_counter()
        resp = client.get(path)
        timings.append((time.perf_counter() - t0) * 1000.0)
        assert resp.status_code < 500, f"{path} returned {resp.status_code} (server error)"

    p95 = percentile(timings, 95)
    worst = max(timings)
    print(f"\nLATENCY {path}: p95={p95:.1f}ms max={worst:.1f}ms (n={SAMPLES})")

    problems = []
    if p95 > P95_BUDGET_MS:
        problems.append(f"p95 {p95:.1f}ms > {P95_BUDGET_MS:.0f}ms")
    if worst > MAX_BUDGET_MS:
        problems.append(f"max {worst:.1f}ms > {MAX_BUDGET_MS:.0f}ms hard ceiling")
    if problems:
        enforce("LATENCY_MODE", f"GET {path}: " + "; ".join(problems))
