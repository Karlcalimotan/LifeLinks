# API Regulation reference

The canonical contract is the root [`API_REGULATION.md`](../API_REGULATION.md).
This folder keeps the language-agnostic specification and the original Python
reference middleware and test suites.

LifeLink's implementation is TypeScript:

- `apps/web/lib/api/context.ts` — per-request request id and timing context
- `apps/web/lib/api/instrumentation.ts` — 2 s timeout, headers, SLOW/VIOLATION logs
- `apps/web/lib/api/envelope.ts` — `{data, meta}` / `{error}` envelopes
- `apps/web/lib/api/errors.ts` — stable error codes and safe messages
- `scripts/api-latency.mjs` — warm-up + p95/max latency check
- `docs/api-regulation.md` — conformance notes and exceptions

The Python files are not loaded by the application; they are the reference
implementation for a FastAPI/Starlette backend.
