# Architecture

LifeLink is a three-part system:

```
┌────────────────────┐        HTTPS / SMS        ┌────────────────────┐
│ ESP32 tracker      │ ────────────────────────▶ │ Next.js console    │
│ MPU-6050, SW-420   │      device token         │ Prisma/Supabase    │
│ NEO-6M, A7670E     │ ◀──────────────────────── │ incident workflow  │
└────────────────────┘      commands + config    └────────────────────┘
          │
          └── SMS to configured phones when the backend is unreachable
```

The design goal is **one obvious path for an alert** and **no path that can
silently suppress one**. Every other decision follows from that.

## Layers

### 1. Web console (`apps/web`)

- `app/[locale]/` — localized routes. The dashboard layout resolves the session
  against the database on every request; a revoked membership stops working on
  the next page load, not when the cookie expires.
- `components/` — small Tailwind primitives, a dark fleet shell, domain badges,
  an evidence chart and the incident actions.
- `lib/actions/` — server actions. The shape is always: authenticate, authorize,
  validate with Zod, mutate, write an audit row, revalidate, redirect.
- `lib/api/` — one `{ data, meta }` / `{ error }` envelope and one `withApi`
  pipeline. Every route gets a request id, a timeout and a `Server-Timing`
  header; failures are normalized.
- `lib/device/` — device token hashing, status policy, payload schemas and the
  time plausibility rule.
- `lib/firmware/` — the server half of the configuration envelope. A test parses
  `firmware/main/config.h` and fails on drift.
- `lib/incidents/` — severity presentation and the status transition map.
- `prisma/` — the schema, the initial migration and the idempotent demo seed.

### 2. Device API

Every route lives under `app/api/device/` and authenticates with the
`x-device-token` header. The database stores only `sha256(token)`, so a leaked
row cannot impersonate a tracker. The token is shown once when the device is
registered or rotated.

| Route | Purpose |
| --- | --- |
| `POST /api/device/ingest` | Heartbeat, batched telemetry and device events |
| `POST /api/device/incident` | Crash report, evidence, alert targets |
| `POST /api/device/incident/cancel` | Driver pressed cancel |
| `GET /api/device/command` | Queued commands + versioned config |
| `POST /api/device/command/ack` | Command acknowledgement |
| `GET /api/firmware/check` | Signed-release manifest (disabled until configured) |

The routes are idempotent:

- telemetry: `@@unique([deviceId, clientSampleId])`
- device events: `@@unique([deviceId, clientEventId])`
- incidents: `@@unique([deviceId, clientIncidentId])`
- commands: delivered until acknowledged or expired; the device dedupes by id
- a repeated incident never creates a second alert storm

The console queue is limited to `LOCATE`, `TEST_ALERT` and `SET_CONFIG`. `ARM`
and `DISARM` remain in `CommandKind` for historical rows only: the console
rejects them and the firmware acknowledges them as `unsupported` without
changing state. Crash detection is always on.

### 3. Firmware (`firmware/`)

The sketch is orchestration only. The decisions live in Arduino-free headers so
they can be compiled and tested on the host:

| Header | Responsibility |
| --- | --- |
| `config.h` | Class A envelope, class B operational defaults, NVS persistence |
| `filters.h` | Impact/tilt/vibration fusion, false-positive rejection, debounce |
| `safety.h` | Countdown, cancel, retry, faults, reset-history helper (not wired) |
| `gps.h` | Fix quality rules |
| `power.h` | ADC scaling, main/backup/critical classification |
| `status.h` | Buzzer patterns |
| `modem.h` | SOS SMS body (bounded, ASCII) |
| `../include/pins.h` | Canonical DevKit V1 pin map |
| `hardware.h` | `hw::` aliases over `pins.h` |

`main.ino` does the I/O: I2C IMU, SW-420 digital input, NEO-6M UART,
A7670E AT transport, buzzer NPN output, battery/ignition ADC.

## Data model

```
Organization ── Membership ── User ── PlatformAdmin
     │                         (global, not a tenant role)
     ├── Vehicle ── TrackerDevice ── DeviceStateEvent
     │        │            │
     │        │            └── DeviceConfigOverride
     │        └── Trip ────┴── TelemetrySample
     │                 │
     └── ImpactEvent ──┴── AlertDelivery
              │
              └── DeviceCommand

OrgSettings, EmergencyContact, Geofence, AuditLog
InvitationToken, MembershipPermission
```

- `DeviceStateEvent` is the device audit log. `lastSeenAt` answers "is it
  online?"; the event log answers "what happened?".
- `ImpactEvent` is the incident. `AlertDelivery` records every intended
  recipient and its state.
- `DeviceConfigOverride` is the optional per-tracker layer over `OrgSettings`.
  A null column inherits the organisation value; the row is deleted when every
  field inherits again.
- `OrgSettings.parkedImpactAlerts` is reserved and not enforced. Settings does
  not expose it, no code reads it, and it is not part of the firmware
  configuration envelope. The column stays to avoid a destructive migration.
- `AuditLog` records member changes (acknowledge, resolve, false alarm,
  configuration, device token rotation, invite, accept, revoke, re-invite) and
  platform changes (`platform.org_suspended`, `platform.org_reinstated` with the
  reason and before/after status).
- `Organization.status` is the tenant kill switch. `ACTIVE` is the default;
  `SUSPENDED` resolves to no session on the next request and is rejected at
  login. `suspendedAt`, `suspendedReason` and `suspendedBy` are cleared on
  reinstate.
- `PlatformAdmin` is a global row keyed to a `User`, not a `Membership` and not
  a `MemberRole`. It grants the separate `/platform` console only. Its migration
  enables RLS with a deny-all policy, so only the owner/Prisma path can read it.
- `InvitationToken` stores the SHA-256 of a single-use invitation link. The
  plaintext exists only in the link shown to the admin who minted it; there is
  no email sender, so the admin copies the link. `MembershipPermission` holds
  explicit per-member overrides; a missing row means "use the role default".
  `Membership.revokedAt` is a soft revoke: the row keeps the person and the
  audit trail, and every request treats it as absent.
- `EmergencyContact.vehicleId` attaches a contact to one vehicle; a null
  `vehicleId` is the organisation-level fallback and only an admin may create
  it. Deleting a vehicle cascades its contacts, so the console archives a
  vehicle as `RETIRED` instead of deleting a row that has incidents or a
  tracker. `@@unique([orgId, phone])` is kept on purpose: one phone is one
  person in an organisation, so a shared contact stays on one vehicle and the
  duplicate is reported instead of silently copied.
- Alert routing reads both sources. `alertTargetsForVehicle` puts the active
  vehicle contacts first, then the `OrgSettings` phones and emails, removes
  duplicates and caps each channel at ten. The command poll uses
  `alertPhonesForDevice`: up to two active vehicle contacts, with the
  organisation phones as the fallback the tracker already expects. The incident
  route queues `AlertDelivery` rows from the same merged targets, so the web
  trail and the device SMS fallback agree.
- Vehicle and contact writes follow the same scope as the pages: an owner may
  register and edit only their own vehicle and the contacts on it, an admin the
  whole organisation, and a responder neither. Every create, edit and archive
  writes an `AuditLog` row with the actor and before/after values.

### Roles and scope

LifeLink has exactly three roles:

| Role | Scope |
| --- | --- |
| `USER` | Vehicle owner. Sees and works only the vehicles whose `ownerId` is their user id. |
| `RESPONDER` | CDRRMO / Pulis. Sees the whole organization fleet and works every incident. |
| `ADMIN` | Manages members, trackers, settings and the whole fleet. |

The scope is enforced in the query (`Vehicle.ownerId`) and again in the incident
action before a mutation. A stale session cookie with a removed role is rejected
on read, so a role change takes effect on the next request.

The role is the baseline, not the whole answer. A `MembershipPermission` row can
grant or take one capability for one membership, and `lib/auth/permissions.ts`
resolves explicit override ?? role default. Admin is never downgraded, so the
last admin cannot lock themselves out. Revoking a membership (`revokedAt`) keeps
the row for re-invite but resolves it as absent on every request.

The platform administrator is deliberately **not** a fourth tenant role. It is
a `PlatformAdmin` row keyed to a user and a separate `/platform` session. A
tenant `ADMIN` cannot reach `/platform`, and a platform admin without a
membership cannot use any tenant page or action. If the same user also has a
membership, they get both consoles with their separate scopes.

## Auth and tenancy

The console uses a self-contained session:

1. `loginAction` validates the credentials, rate-limits per email + IP, verifies
   bcrypt, and signs a short JWT (HS256) into an HttpOnly cookie.
2. `getCurrentUser()` verifies the cookie and re-reads the membership row and its
   organization. The returned `orgId` is the only tenant scope any query may
   use. A revoked membership or a `SUSPENDED` organization resolves to null, and
   the permission overlay is resolved in the same read.
3. `requireUser()` redirects to the localized login. `requireRole()` narrows the
   page to admins where required.
4. `/platform` is a separate area with its own `lifelink_platform_session`
   cookie (`scope: "platform"`), `requirePlatformAdmin()` guard and
   `PlatformAdmin` row. The environment gate must be open; otherwise the route
   returns not-found. The tenant session is not accepted there.

There is no external identity provider and no MFA provider. The platform gate
and its development-only allow-without-MFA flag are documented in
`SECURITY.md`; do not treat the flag as MFA.

## Configuration contract

The server sends a versioned object in the command poll:

```json
{
  "version": 1,
  "rev": 123456789,
  "impact_threshold_g": 15,
  "tilt_threshold_deg": 60,
  "confirm_window_ms": 200,
  "cancel_window_s": 15,
  "heartbeat_interval_s": 30,
  "sos_retry_s": 60
}
```

Rules:

- A missing object leaves the last-good copy in force.
- A wrong version is ignored.
- Any field outside its envelope, a fraction in a whole-number field, or an
  impossible value rejects the **whole** object. The device never half-applies.
- The last-good copy is stored in NVS (`cfg_json`, `cfg_rev`).
- The device echoes `config_rev` in the heartbeat, so a responder can prove the
  unit applied the exact object.

The effective object is `DeviceConfigOverride` field ?? `OrgSettings` field.
`apps/web/lib/settings/device-config.ts` resolves it once for the command poll,
heartbeat and ingest. Incident creation uses the effective `cancel_window_s`
for the server cancel deadline, so the device countdown and the server deadline
agree per tracker.

The server and firmware tables are kept in sync by
`apps/web/lib/firmware/config.test.ts` and `pnpm stack:check`.

## Deliberately left out

LifeLink is a **lean** fleet console. It does not include an AI assistant,
import/export, a calendar, a 3D viewer, or a general-purpose tenant
administration suite. The `/platform` area is intentionally narrow: it lists
organizations and suspends or reinstates one, with a required reason, password
step-up and an audit row. It is not a super-tenant role and does not grant
tenant permissions. The generators in `stack/` are the intended way to add a
new feature without copying a large domain pack.

## Extension points

- `pnpm gen feature <name>` — page + action + schema + test
- `pnpm gen device-route <name>` — device route + schema + test
- `pnpm gen firmware-module <name>` — pure header + native test
- `pnpm gen model <Name>` — Prisma model + schema + test
- `OrgSettings` — add an operational field only if it belongs in the class B
  envelope; otherwise use a compile-time constant in the firmware.
- `DeviceConfigOverride` — add a field only after it exists in the firmware
  contract. A null column must mean inherit, never a hidden default.
- `DeviceCommand` — add a command kind, handle it in `handleCommands()` and
  acknowledge it. Never add a command that can suppress the SOS path.
