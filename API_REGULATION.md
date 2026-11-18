# API Regulation — Global Backend Contract

**Version:** 1.0 · **Applies to:** any backend language or framework (Node, Go, Java, Python, Ruby, PHP, .NET, …)
**Scope:** HTTP + JSON semantics only. Nothing here depends on a specific stack.

---

## 1. Purpose & Scope

This document defines how a frontend (web, mobile, other service) and a backend **MUST** communicate over HTTP so that:

1. Every response has the same predictable shape.
2. Data appears on screen fast: **server-side p95 ≤ 300 ms, hard ceiling 400 ms** per endpoint.
3. Slowness is detected automatically (headers, logs, CI), not discovered by users.

It applies to every endpoint under `/api/`. Paste this file into the repo root as `API_REGULATION.md` and treat it as part of the code review checklist.

---

## 2. Conformance Levels

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are used as in RFC 2119.

| Level | Meaning | Required for |
|-------|---------|--------------|
| **L1 – Compliant** | All MUST rules in §3–§9 pass | Every endpoint, before merge |
| **L2 – Fast** | L1 + p95 ≤ 300 ms and no request > 400 ms in the CI latency suite | Every endpoint that is on a screen's first render ("hot path") |
| **L3 – Hardened** | L2 + documented query plan, cache policy, and load-tested at 2× expected peak | Endpoints touching money, auth, or reports |

An endpoint that fails its level **MUST NOT** be merged. Existing non-conforming endpoints are tracked in a backlog and fixed in priority order (hot paths first).

---

## 3. Transport & Versioning

- **MUST** use HTTP/1.1 or newer over TLS in production.
- **MUST** exchange JSON only: `Content-Type: application/json; charset=utf-8` for requests with a body and for all responses (file downloads excepted).
- **MUST** put the version in the path: `/api/v1/...`.
- **MUST NOT** make breaking changes inside a version. Breaking = removing/renaming a field, changing a type, changing meaning, tightening validation. Breaking changes ship as `/api/v2/...` and `v1` stays alive for a documented deprecation window.
- **MAY** add new optional fields to responses without a version bump. Clients **MUST** ignore unknown fields.
- **SHOULD** support gzip or brotli compression for responses larger than 1 KB.

---

## 4. Response Envelope

Every JSON response uses one of two shapes.

### 4.1 Success

```json
{
  "data": { "id": "9b2f…", "name": "Maria Santos" },
  "meta": { "request_id": "c1f4…" }
}
```

- `data` **MUST** be present. It is an object for single resources and an array for collections.
- `meta` **MUST** be present (may hold only `request_id`).
- List endpoints **MUST** add pagination info to `meta`:

```json
{
  "data": [ { "id": "…" }, { "id": "…" } ],
  "meta": {
    "request_id": "c1f4…",
    "page": { "limit": 50, "next_cursor": "eyJpZCI6…", "has_more": true, "total": 1280 }
  }
}
```

  `total` **MAY** be omitted when computing it would break the latency budget (see §8.2, rule 7).
- Operations with no result body (e.g., delete) **MUST** return `204 No Content` with an empty body.

### 4.2 Error

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Amount must be greater than zero.",
    "details": [ { "field": "amount", "issue": "must be > 0" } ],
    "request_id": "c1f4…"
  }
}
```

- `code`: stable, machine-readable, `UPPER_SNAKE_CASE`. Clients branch on this, never on `message`.
- `message`: human-readable, safe to display. **MUST NOT** contain stack traces, SQL, file paths, or secrets.
- `details`: optional array or object with field-level information.
- Every error body **MUST** contain `request_id` so logs can be correlated.

---

## 5. HTTP Status Code Map

| Status | When | `error.code` examples |
|--------|------|-----------------------|
| `200 OK` | Successful read/update returning a body | – |
| `201 Created` | Resource created. **MUST** include a `Location` header | – |
| `204 No Content` | Successful delete / no body | – |
| `400 Bad Request` | Malformed JSON, bad query params | `BAD_REQUEST` |
| `401 Unauthorized` | Missing/invalid credentials | `UNAUTHENTICATED` |
| `403 Forbidden` | Authenticated but not allowed | `FORBIDDEN` |
| `404 Not Found` | Resource does not exist | `NOT_FOUND` |
| `409 Conflict` | Duplicate, version clash, state conflict | `CONFLICT` |
| `422 Unprocessable Entity` | Well-formed but fails validation | `VALIDATION_FAILED` |
| `429 Too Many Requests` | Rate limited. **SHOULD** send `Retry-After` | `RATE_LIMITED` |
| `500 Internal Server Error` | Unexpected failure | `INTERNAL_ERROR` |
| `503 Service Unavailable` | Dependency down / overloaded | `UNAVAILABLE` |
| `504 Gateway Timeout` | Upstream or DB exceeded its timeout | `TIMEOUT` |

Rules:
- **MUST NOT** return `200` with an error inside the body.
- **MUST** use `GET` only for reads (safe, no side effects), `POST` for create/actions, `PUT`/`PATCH` for updates, `DELETE` for removal.

---

## 6. Resource & Naming Rules

- Resources are **plural, lowercase, kebab-case nouns**: `/api/v1/students`, `/api/v1/payment-records`.
- Hierarchy at most two levels deep: `/api/v1/students/{id}/payments`. Beyond that, use query filters.
- Actions that do not fit CRUD use a sub-resource verb: `POST /api/v1/payments/{id}/refund`.
- JSON fields: `snake_case` (or `camelCase`, but **one** choice per project, documented here).
- IDs are opaque strings or UUIDs. Clients **MUST NOT** parse them.

**Query conventions (lists):**

| Purpose | Parameter | Example |
|---------|-----------|---------|
| Page size | `limit` (default 50, max 100) | `?limit=50` |
| Cursor paging (preferred) | `cursor` | `?cursor=eyJpZCI6…` |
| Offset paging (allowed for small tables) | `offset` | `?offset=100` |
| Filter | `field=value` | `?status=unpaid` |
| Range | `field_from`, `field_to` | `?created_from=2026-01-01` |
| Sort | `sort=field` / `sort=-field` | `?sort=-created_at` |
| Field selection | `fields=a,b,c` | `?fields=id,name` |

- Only **whitelisted** filter and sort fields are accepted; unknown ones return `400`.
- Every sortable/filterable field **MUST** be backed by an index (§8.2).

---

## 7. Data Type Rules

| Type | Rule |
|------|------|
| **Money** | **MUST** be an integer in minor units (`"amount": 15050` = 150.50) **or** a decimal string (`"150.50"`). **MUST NOT** be a binary float. Always paired with a `currency` (ISO 4217) when more than one currency is possible. |
| **Timestamps** | ISO-8601 in UTC with `Z`: `2026-10-22T04:51:00Z`. Never local time, never epoch ints. |
| **Dates** | `YYYY-MM-DD` |
| **Booleans** | `true` / `false` only (never `"yes"`, `1`) |
| **Enums** | `lower_snake_case` strings, documented set |
| **Null vs missing** | A field that exists in the schema is always present; use `null` for "no value". |
| **Large numbers** | Integers above 2^53 **MUST** be strings. |

**No over-fetching.** Queries **MUST** list explicit columns (never `SELECT *` on the hot path), and responses **MUST** include only fields the client uses. Heavy fields (blobs, long text, nested lists) are opt-in via `fields=` or a dedicated endpoint.

---

## 8. Performance Contract (the core)

### 8.1 Latency Budget

The budget measures **server-side processing time**: from the moment the request is fully received to the moment the last byte of the response is handed to the network layer. Network transit and client rendering are covered separately in §8.3.

| Metric | Target | Consequence |
|--------|--------|-------------|
| **p95 latency** per endpoint | **≤ 300 ms** | Above this: logged as `SLOW`, fails L2 |
| **Max latency** per request | **≤ 400 ms** | Above this: logged as `VIOLATION`, fails CI |
| **Absolute timeout** | **2 000 ms** | Server aborts the request and returns `504 TIMEOUT` |

**Budget decomposition (guideline for where the time may go):**

| Stage | Budget |
|-------|--------|
| Database (all queries combined) | ≤ 150 ms |
| Application logic | ≤ 80 ms |
| Serialization & compression | ≤ 20 ms |
| Headroom (GC, scheduling, jitter) | ~ 50 ms |
| **Total** | **≈ 300 ms** |

If a stage exceeds its slice, the endpoint must be redesigned, not given a bigger budget.

### 8.2 Mandatory Rules

1. **One query round-trip per request on the hot path.** No N+1. Never run a query inside a loop over rows. Use `JOIN`, `IN (…)`/`ANY(…)`, or batched lookups.
2. **Aggregate in the database.** Sums, counts, group-bys, and rankings are computed by SQL, not by looping over rows in application code.
3. **Every filter, join, and sort column is indexed.** A sequential scan on a table expected to exceed 10 000 rows is a defect.
4. **Pagination on every list endpoint.** `limit` default 50, **hard max 100**. No unbounded lists.
5. **Response size cap: ≤ 256 KB** (uncompressed). Larger payloads must be paginated or split.
6. **Database statement timeout: 1 000 ms** (set at connection or role level). Queries that can legitimately exceed this move to background jobs.
7. **Count queries are optional.** `COUNT(*)` over large tables is expensive; return `total` only when it fits the budget, otherwise use `has_more`.
8. **Cache reference data.** Data that changes rarely (settings, categories, school years, rate tables) **MUST** be cacheable:
   - HTTP: `Cache-Control: public, max-age=300` (or `private` if user-specific) plus `ETag`; honor `If-None-Match` with `304`.
   - Server: in-process or Redis cache with explicit invalidation on write.
9. **No blocking external calls in the request path** (email, SMS, webhooks, PDF generation, third-party APIs). Queue them and return `202 Accepted` with a status URL.
10. **Bounded connection pool.** Pool size is set deliberately (not unlimited); pool-wait time counts toward the latency budget and is logged.
11. **Writes are fast too.** Insert/update endpoints follow the same 300/400 ms rule; bulk imports use batch inserts (`executemany`/`COPY`/multi-row `INSERT`), never one query per row.
12. **Idempotency.** `POST` endpoints that move money or create important records **SHOULD** accept an `Idempotency-Key` header so retries are safe.

### 8.3 Perceived-Speed Rules for Clients

The server budget only helps if the client uses it well. Frontend and mobile code **MUST**:

1. Use **one shared API client function** (e.g., `apiFetch`) for every call. It handles base URL, auth header, JSON parsing, envelope unwrapping, error mapping, and the timeout. No raw `fetch()` calls scattered through the UI.
2. Set a **client timeout of 1 000 ms** for reads (abort, then show a retry state) and a longer, explicit timeout for writes.
3. Fetch **independent resources in parallel** (`Promise.all` or equivalent), never in sequential `await` chains.
4. **Render immediately.** Show the page shell and skeleton/placeholder content right away, then swap in data when it resolves. Never block the whole screen on a spinner.
5. Request only what the screen needs (`fields=`, `limit=`).
6. Cache and reuse recent reads on the client (memory or stale-while-revalidate) for navigation between screens.
7. Disable submit buttons while a write is pending and update the UI optimistically when safe.
8. Retry only idempotent requests (`GET`, or `POST` with `Idempotency-Key`), at most twice with backoff.

---

## 9. Observability

Measurement is what makes the budget real.

- **MUST** add a `Server-Timing` header to every response:
  `Server-Timing: total;dur=142.3, db;dur=91.0`
  (`total` required; `db` and `app` SHOULD be included when measurable.)
- **MUST** add `X-Request-Id` to every response (generate if the client did not send one) and echo it in `meta.request_id` / `error.request_id`.
- **MUST** log every request slower than **300 ms** as `WARN SLOW` and every request slower than **400 ms** as `ERROR VIOLATION`, each with: method, route **template** (not raw URL), status, duration, DB time, request id.
- **SHOULD** count queries per request and log a warning when a single request issues more than **5** queries (N+1 smell).
- **SHOULD** export per-route p50/p95/p99 and error-rate metrics to the team's monitoring tool and alert when p95 > 300 ms for 5 consecutive minutes.
- **MUST NOT** log secrets, passwords, tokens, or full card/ID numbers.

---

## 10. Endpoint Conformance Checklist

Copy this into every pull request that adds or changes an endpoint.

```
Endpoint: METHOD /api/v1/…                       Level targeted: L1 / L2 / L3

Contract
[ ] Path is plural kebab-case, versioned (/api/v1)
[ ] Success uses {"data","meta"}; errors use {"error":{code,message,details,request_id}}
[ ] Correct HTTP status codes (§5); no 200-with-error
[ ] Money is integer minor units or decimal string; timestamps are ISO-8601 UTC
[ ] Unknown filter/sort fields rejected with 400

Performance
[ ] Explicit column list (no SELECT * on hot path)
[ ] Query count per request: ____  (target: 1 on hot path, never in a loop)
[ ] Aggregations done in SQL
[ ] EXPLAIN (ANALYZE) pasted below; no seq scan on large tables
[ ] Indexes exist for every filter/join/sort column (migration included)
[ ] List endpoint paginated; limit default 50, max 100
[ ] Response ≤ 256 KB at max page size
[ ] Reference data has Cache-Control + ETag
[ ] No blocking external calls (email/SMS/PDF) in request path
[ ] Measured locally: p95 = ____ ms (≤ 300)   max = ____ ms (≤ 400)

Observability
[ ] Server-Timing and X-Request-Id present
[ ] Contract test + latency test added to CI

EXPLAIN output:
<paste here>
```

---

## 11. CI Enforcement Recipe

Rules that are not tested are suggestions. Add two automated suites to CI. Both are described in language-agnostic pseudocode; implement them with your stack's test runner.

### 11.1 Latency budget test

```
CONFIG:
  WARMUP        = 5 requests per endpoint (discarded)
  SAMPLES       = 30 requests per endpoint
  P95_BUDGET_MS = 300
  MAX_BUDGET_MS = 400
  DATASET       = seeded database with realistic volume
                  (e.g. 10 000+ rows in the largest tables)

for each endpoint in HOT_ENDPOINTS:            # GET list/detail/report routes
    send WARMUP requests
    timings = []
    for i in 1..SAMPLES:
        t0 = now()
        resp = http.request(endpoint)
        timings.append(now() - t0)
        assert resp.status < 500
    p95 = percentile(timings, 95)
    mx  = max(timings)
    record(endpoint, p95, mx)
    assert p95 <= P95_BUDGET_MS,  "p95 over budget"
    assert mx  <= MAX_BUDGET_MS,  "request over hard ceiling"
```

Rollout: run in **warn mode** (report, do not fail) for the first two weeks while existing endpoints are fixed, then switch to **fail mode**.

### 11.2 Contract test

```
for each endpoint in ALL_READ_ENDPOINTS:
    resp = http.get(endpoint)
    if resp.status == 200:
        assert resp.json has keys "data" and "meta"
        assert header "Server-Timing" present
        assert header "X-Request-Id" present
    if resp.status >= 400:
        assert resp.json["error"] has "code", "message", "request_id"

assert http.get("/api/v1/does-not-exist").status == 404 with error envelope
assert list endpoints with limit=1000 return at most 100 items (or 400)
```

### 11.3 Optional load check

Before releasing an L3 endpoint, run a short load test (e.g., k6, wrk, autocannon, Locust, JMeter) at 2× expected peak concurrency for 60 seconds. Pass condition: p95 ≤ 300 ms and error rate < 0.1 %.

### 11.4 Fix playbook for a failing endpoint

1. Look at `Server-Timing`: is the time in `db` or `app`?
2. If `db`: run `EXPLAIN (ANALYZE, BUFFERS)`; add the missing index; remove the loop/N+1; push the aggregation into SQL; select fewer columns.
3. If `app`: profile, remove repeated work, cache reference data, stream or paginate large results.
4. If both are fine but total is high: check serialization size and pool wait time.
5. Still over budget: move the work to a background job and return `202`.

---

## 12. Appendix — Examples

### 12.1 List with filter, sort, pagination

```
GET /api/v1/payments?status=unpaid&sort=-created_at&limit=2
```
```json
{
  "data": [
    { "id": "p_102", "student_id": "s_8", "amount": 150000, "currency": "PHP", "status": "unpaid", "created_at": "2026-10-20T08:15:00Z" },
    { "id": "p_101", "student_id": "s_3", "amount": 150000, "currency": "PHP", "status": "unpaid", "created_at": "2026-10-19T09:02:00Z" }
  ],
  "meta": {
    "request_id": "7a1c…",
    "page": { "limit": 2, "next_cursor": "eyJpZCI6InBfMTAxIn0", "has_more": true }
  }
}
```
Response headers:
```
Server-Timing: total;dur=48.7, db;dur=31.2
X-Request-Id: 7a1c…
```

### 12.2 Create

```
POST /api/v1/payments
Idempotency-Key: 5c9e0b2e-…
{ "student_id": "s_8", "amount": 150000, "currency": "PHP" }
```
```
201 Created
Location: /api/v1/payments/p_103
```
```json
{ "data": { "id": "p_103", "student_id": "s_8", "amount": 150000, "currency": "PHP", "status": "unpaid" },
  "meta": { "request_id": "b44d…" } }
```

### 12.3 Validation error

```
422 Unprocessable Entity
```
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Amount must be greater than zero.",
             "details": [ { "field": "amount", "issue": "must be > 0" } ],
             "request_id": "e90a…" } }
```

### 12.4 N+1 → single round trip (illustrative SQL)

Bad (one query per student):
```
students = query("SELECT id, name FROM students")
for s in students:
    s.total_paid = query("SELECT SUM(amount) FROM payments WHERE student_id = ?", s.id)
```
Good (one query, aggregated in the database):
```sql
SELECT s.id, s.name, COALESCE(SUM(p.amount), 0) AS total_paid
FROM students s
LEFT JOIN payments p ON p.student_id = s.id
GROUP BY s.id, s.name
ORDER BY s.name
LIMIT 50;
-- supporting index: CREATE INDEX idx_payments_student_id ON payments (student_id);
```

### 12.5 Reference-data caching

```
GET /api/v1/school-years
→ 200
  Cache-Control: public, max-age=300
  ETag: "v7"

GET /api/v1/school-years
  If-None-Match: "v7"
→ 304 Not Modified
```

---

## 13. How to Adopt (4 steps)

1. **Envelope** — Introduce the `{data, meta}` / `{error}` shapes (§4) and `X-Request-Id`. Keep adapters for old shapes while clients migrate.
2. **Middleware** — Add one global middleware/filter that measures total time, writes `Server-Timing`, and logs `SLOW` (> 300 ms) and `VIOLATION` (> 400 ms) (§9).
3. **Budget tests** — Add the latency and contract suites (§11) to CI. Start in warn mode, switch to fail mode after fixing the first offenders.
4. **Audit** — Walk every existing endpoint with the checklist (§10). Fix in this order: hot-path screens → reports/aggregates → writes and imports. Track the status of each endpoint (L1/L2/L3) in a table in this file or the project wiki.

---

*Changes to this regulation are made by pull request and bump the version at the top of the file.*
