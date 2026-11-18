# ADR-0001: Reuse the platform shell, not a large domain pack

## Status

Accepted, 2026-11-18.

## Context

The starting point was a mature aquaculture management application. It contains
a great deal of hard-won platform work: a request envelope, a device-token
contract, a versioned firmware configuration, native tests for Arduino-free
headers, an audit trail and a disciplined build pipeline. It also contains a
large domain: ponds, biomass, cycles, calendars, imports, a platform console and
an assistant.

Copying the whole repository into a vehicle-alert project would carry all of that
domain surface, its tests, its translations and its data assumptions. The result
would compile, but it would be harder to understand, harder to defend and harder
to change safely.

## Decision

Extract a **lean platform shell** and a **vehicle-alert domain pack**:

- keep the request envelope, auth, device auth, event log, incident workflow,
  configuration contract, firmware test split and build gates
- drop the aquaculture domain, the platform console, the assistant, import/export
  and the calendar
- provide generators for the next feature instead of copying a large module

The reusable artifact is a scaffold plus generators, not an npm package of the
whole app.

## Consequences

- The new project starts with about a dozen domain models instead of dozens.
- Every remaining file has a reason to be there.
- The generators must be maintained; they are the repeatable part.
- A future project can choose a different domain pack without inheriting this
  one.
