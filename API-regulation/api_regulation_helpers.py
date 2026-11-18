"""
Shared helpers for the API regulation test suites.

Environment variables (all optional)
------------------------------------
API_APP_IMPORT       "module:attr" of the ASGI app           (default "app.main:app")
API_TEST_TOKEN       bearer token sent on every request       (default: none)
API_HOT_ENDPOINTS    comma-separated GET paths to test        (default: auto-discover)
                     use this to include routes with path params, e.g. /api/v1/students/1
"""
from __future__ import annotations

import importlib
import os
import warnings
from typing import Dict, Iterable, List

import pytest
from fastapi.routing import APIRoute

SKIP_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def load_app():
    target = os.getenv("API_APP_IMPORT", "app.main:app")
    module_name, _, attr = target.partition(":")
    return getattr(importlib.import_module(module_name), attr or "app")


def auth_headers() -> Dict[str, str]:
    token = os.getenv("API_TEST_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


def discover_get_endpoints(app) -> List[str]:
    """GET routes without path parameters (they can be called as-is)."""
    explicit = os.getenv("API_HOT_ENDPOINTS")
    if explicit:
        return [p.strip() for p in explicit.split(",") if p.strip()]
    paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
        and "GET" in route.methods
        and "{" not in route.path
        and route.path not in SKIP_PATHS
    }
    return sorted(paths)


def percentile(values: Iterable[float], pct: float) -> float:
    """Nearest-rank percentile."""
    ordered = sorted(values)
    if not ordered:
        return 0.0
    rank = max(1, int(-(-pct / 100.0 * len(ordered) // 1)))  # ceil
    return ordered[min(rank, len(ordered)) - 1]


def enforce(mode_env: str, message: str) -> None:
    """
    warn (default): report the problem but keep CI green  -> rollout phase
    fail          : fail the test                          -> enforcement phase
    """
    mode = os.getenv(mode_env, "warn").strip().lower()
    if mode == "fail":
        pytest.fail(message, pytrace=False)
    warnings.warn(f"[{mode_env}=warn] {message}", stacklevel=2)
