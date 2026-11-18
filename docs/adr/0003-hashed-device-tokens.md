# ADR-0003: Store device tokens as hashes only

## Status

Accepted, 2026-11-18.

## Context

A tracker authenticates with a bearer token. If the database stores the
plaintext, a read-only leak is enough to impersonate every device. A display
column is convenient for an operator, but it turns the database into a
credential store.

## Decision

- Store `sha256(token)` in `TrackerDevice.tokenHash` with a unique constraint.
- Show the plaintext exactly once at registration or rotation.
- Look up by hash and confirm with `timingSafeEqual`.
- Never log the token, never put it in a URL, never persist it in the browser
  beyond the one-time display state.
- A pending or rejected device authenticates but receives `403`, which is
  distinct from the `401` for an unknown token.

## Consequences

- A lost token is rotated, not recovered. That is the correct trade-off.
- The registration UI must make the one-time display obvious.
- The firmware stores its token in NVS; a factory reset or a re-provision is the
  recovery path.
