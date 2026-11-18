"""
Latency regulation middleware  (see API_REGULATION.md §8–§9)

What it does
------------
* Adds ``Server-Timing``, ``X-Response-Time`` and ``X-Request-Id`` to every response.
* Logs ``SLOW``      when a request takes more than 300 ms.
* Logs ``VIOLATION`` when a request takes more than 400 ms.
* Logs ``N+1 SUSPECT`` when one request runs more than 5 tracked DB queries.
* Keeps simple in-process counters (see ``get_latency_counters``).
* Optional: ``register_error_envelope(app)`` makes every error use the
  regulation's ``{"error": {code, message, details, request_id}}`` shape.

Install (app/main.py)
---------------------
    from app.middleware import LatencyMiddleware, register_error_envelope

    app = FastAPI()
    app.add_middleware(LatencyMiddleware)   # add last so it wraps everything
    register_error_envelope(app)            # optional, enables the error envelope

Optional DB timing (app/database.py or inside a router)
-------------------------------------------------------
    from app.middleware import track_db

    with track_db():
        cur.execute(sql, params)
        rows = cur.fetchall()

Each ``track_db`` block counts as one query and its time is reported as
``db;dur=...`` in ``Server-Timing``.

Thresholds can be overridden with environment variables:
    API_SLOW_MS (default 300), API_VIOLATION_MS (default 400), API_MAX_QUERIES (default 5)
"""
from __future__ import annotations

import contextvars
import logging
import os
import re
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Optional

logger = logging.getLogger("api.latency")

SLOW_MS = float(os.getenv("API_SLOW_MS", "300"))
VIOLATION_MS = float(os.getenv("API_VIOLATION_MS", "400"))
MAX_QUERIES = int(os.getenv("API_MAX_QUERIES", "5"))

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")

# Per-request mutable stats. The dict is shared with worker threads (sync endpoints
# run in a threadpool), so mutations made there are visible to the middleware.
_request_stats: "contextvars.ContextVar[Optional[Dict[str, Any]]]" = contextvars.ContextVar(
    "api_request_stats", default=None
)

_counters = {"requests": 0, "slow": 0, "violations": 0}


def get_latency_counters() -> Dict[str, int]:
    """Snapshot of requests / slow / violations since process start."""
    return dict(_counters)


@contextmanager
def track_db():
    """Wrap one database round-trip so its time and count are reported."""
    stats = _request_stats.get()
    start = time.perf_counter()
    try:
        yield
    finally:
        if stats is not None:
            stats["db_ms"] += (time.perf_counter() - start) * 1000.0
            stats["queries"] += 1


class LatencyMiddleware:
    """Pure ASGI middleware (no BaseHTTPMiddleware overhead, works with sync routes)."""

    def __init__(self, app, slow_ms: float = SLOW_MS, violation_ms: float = VIOLATION_MS):
        self.app = app
        self.slow_ms = slow_ms
        self.violation_ms = violation_ms

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        incoming = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex

        scope.setdefault("state", {})["request_id"] = request_id
        stats: Dict[str, Any] = {"db_ms": 0.0, "queries": 0}
        token = _request_stats.set(stats)
        state = {"status": 500, "recorded": False}

        def record():
            if state["recorded"]:
                return
            state["recorded"] = True
            self._record(scope, state["status"], (time.perf_counter() - start) * 1000.0, stats, request_id)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                elapsed = (time.perf_counter() - start) * 1000.0
                timing = f"total;dur={elapsed:.1f}"
                if stats["queries"]:
                    timing += f", db;dur={stats['db_ms']:.1f}"
                headers = list(message.get("headers", []))
                headers.append((b"server-timing", timing.encode("latin-1")))
                headers.append((b"x-response-time", f"{elapsed:.1f}ms".encode("latin-1")))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            elif message["type"] == "http.response.body" and not message.get("more_body", False):
                record()
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            record()  # covers exceptions raised before a response was sent
            _request_stats.reset(token)

    def _record(self, scope, status: int, elapsed_ms: float, stats: Dict[str, Any], request_id: str):
        _counters["requests"] += 1
        route = scope.get("route")
        path = getattr(route, "path", None) or scope.get("path", "?")  # template, not raw URL
        line = "%s %s status=%s total=%.1fms db=%.1fms queries=%d request_id=%s" % (
            scope.get("method", "?"), path, status, elapsed_ms, stats["db_ms"], stats["queries"], request_id,
        )
        if elapsed_ms > self.violation_ms:
            _counters["violations"] += 1
            logger.error("VIOLATION (>%.0fms) %s", self.violation_ms, line)
        elif elapsed_ms > self.slow_ms:
            _counters["slow"] += 1
            logger.warning("SLOW (>%.0fms) %s", self.slow_ms, line)
        if stats["queries"] > MAX_QUERIES:
            logger.warning("N+1 SUSPECT (%d queries > %d) %s", stats["queries"], MAX_QUERIES, line)


# --------------------------------------------------------------------------------------
# Optional: standard error envelope (API_REGULATION.md §4.2)
# --------------------------------------------------------------------------------------
_CODE_BY_STATUS = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_FAILED",
    429: "RATE_LIMITED",
    503: "UNAVAILABLE",
    504: "TIMEOUT",
}


def _error_body(request, status: int, message: str, details: Any = None, code: Optional[str] = None):
    error: Dict[str, Any] = {
        "code": code or _CODE_BY_STATUS.get(status, "INTERNAL_ERROR" if status >= 500 else "BAD_REQUEST"),
        "message": message,
        "request_id": getattr(request.state, "request_id", None),
    }
    if details is not None:
        error["details"] = details
    return {"error": error}


def register_error_envelope(app) -> None:
    """Make HTTP errors, validation errors and crashes use the regulation's error shape."""
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(StarletteHTTPException)
    async def _http_exc(request, exc):
        detail = exc.detail
        message = detail if isinstance(detail, str) else "Request failed."
        details = None if isinstance(detail, str) else detail
        return JSONResponse(
            _error_body(request, exc.status_code, message, details),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_exc(request, exc):
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")),
                "issue": err.get("msg", "invalid"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            _error_body(request, 422, "Request validation failed.", details),
            status_code=422,
        )

    @app.exception_handler(Exception)
    async def _unhandled(request, exc):
        logger.exception("Unhandled error request_id=%s", getattr(request.state, "request_id", None))
        # Never leak stack traces, SQL or paths to the client.
        return JSONResponse(
            _error_body(request, 500, "Something went wrong on our side."),
            status_code=500,
        )
