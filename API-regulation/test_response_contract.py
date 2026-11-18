"""
Response contract suite  (API_REGULATION.md §4, §9 and §11.2)

Checks every GET endpoint for:
  * 2xx  -> JSON body with "data" and "meta"
  * 4xx  -> JSON body with "error": {code, message, request_id}
  * every response carries Server-Timing and X-Request-Id
  * unknown routes return a 404 error envelope
  * list endpoints never return more than 100 items, even when limit=1000

Rollout:   CONTRACT_MODE=warn  (default)  report only, CI stays green
Enforce:   CONTRACT_MODE=fail             fail CI on any breach

    CONTRACT_MODE=fail pytest tests/test_response_contract.py
"""
import pytest
from fastapi.testclient import TestClient

try:
    from api_regulation_helpers import auth_headers, discover_get_endpoints, enforce, load_app
except ImportError:  # tests/ is a package
    from tests.api_regulation_helpers import auth_headers, discover_get_endpoints, enforce, load_app

MODE = "CONTRACT_MODE"
MAX_PAGE_SIZE = 100

APP = load_app()
ENDPOINTS = discover_get_endpoints(APP)


@pytest.fixture(scope="module")
def client():
    with TestClient(APP) as c:
        c.headers.update(auth_headers())
        yield c


def _json(resp):
    try:
        return resp.json()
    except ValueError:
        return None


def _check_headers(resp):
    return [f"missing header {h}" for h in ("server-timing", "x-request-id") if h not in resp.headers]


def _check_error_envelope(body):
    if not isinstance(body, dict) or not isinstance(body.get("error"), dict):
        return ['error body must be {"error": {...}}']
    return [f"error.{k} missing" for k in ("code", "message", "request_id") if not body["error"].get(k)]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_envelope_and_headers(client, path):
    resp = client.get(path)
    assert resp.status_code < 500, f"{path} returned {resp.status_code} (server error)"

    problems = _check_headers(resp)
    body = _json(resp)
    if 200 <= resp.status_code < 300 and resp.status_code != 204:
        if not isinstance(body, dict):
            problems.append("success body must be a JSON object")
        else:
            problems += [f'success body missing "{k}"' for k in ("data", "meta") if k not in body]
    elif resp.status_code >= 400:
        problems += _check_error_envelope(body)

    if problems:
        enforce(MODE, f"GET {path} [{resp.status_code}]: " + "; ".join(problems))


def test_unknown_route_uses_error_envelope(client):
    resp = client.get("/api/v1/this-route-does-not-exist")
    assert resp.status_code == 404
    problems = _check_error_envelope(_json(resp)) + _check_headers(resp)
    if problems:
        enforce(MODE, "unknown route: " + "; ".join(problems))


@pytest.mark.parametrize("path", ENDPOINTS)
def test_page_size_is_capped(client, path):
    resp = client.get(path, params={"limit": 1000})
    if resp.status_code != 200:
        return  # rejected (400/422) is also acceptable
    body = _json(resp)
    data = body.get("data") if isinstance(body, dict) else body
    if isinstance(data, list) and len(data) > MAX_PAGE_SIZE:
        enforce(MODE, f"GET {path}?limit=1000 returned {len(data)} items (max {MAX_PAGE_SIZE})")
