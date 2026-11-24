# Security

## Reporting

Report a vulnerability privately to the repository owner. Do not open a public
issue with a working exploit or a real device token.

## What is protected

- **Device tokens** are stored as SHA-256 hashes. The plaintext is shown once at
  registration or rotation and is never persisted. A database dump does not
  allow a tracker to be impersonated.
- **User passwords** are bcrypt hashes (12 rounds).
- **Sessions** are HS256 JWTs in an HttpOnly, SameSite=Lax cookie. `AUTH_SECRET`
  must be a long random value outside development.
- **Tenant scope** comes from the membership row on every request, not from a
  client-supplied organization id.
- **Role checks** happen in the page or action before a write; the role is
  re-read from the database, not trusted from the cookie alone. A `USER`
  (vehicle owner) is additionally scoped by `Vehicle.ownerId` in every list,
  detail query and incident mutation; `RESPONDER` and `ADMIN` are org-scoped.
- **Rate limits** cover login attempts per email + IP. They are in-process; a
  multi-instance deployment should replace the store with PostgreSQL or Redis.
- **Idempotency** prevents a retried SOS from creating duplicate incidents or
  duplicate alert storms.

## Secrets

Never commit:

- `.env` or any file with a real `DATABASE_URL`, `AUTH_SECRET` or `CRON_SECRET`
- device tokens
- SIM ICCID, APN credentials or phone numbers of real people
- OTA private keys

The firmware's provisioning token is entered over USB serial and stored in NVS.
It is not compiled into the image.

## Database

The demo seed refuses a non-local database unless `SEED_DEMO=yes` is explicitly
set. Do not run the seed against a shared or production database.

### Tenant isolation and RLS

- The application's orgId filters and role checks are **authoritative**. A page
  or action must still prove that a row belongs to the caller's organization.
- RLS is **defense-in-depth** for non-owner roles (PostgREST, a future app role
  or the test role). Prisma connects as the database owner, which bypasses RLS
  by design; do not claim RLS alone is the tenant boundary.
- Per-org policies use the transaction-local
  `app.current_org_id` setting. If it is absent or empty, the policies evaluate
  false and return no rows.
- `lifelink_rls_test` is a `NOLOGIN` verification role created by the RLS
  migration. It is not a production credential; tests `SET LOCAL ROLE` inside a
  transaction and roll back.
- The non-owner test is skipped unless `RLS_TEST_ALLOW=1` and
  `RLS_TEST_DATABASE_URL` point at a disposable database. Never run it against
  production.

## Data retention

- `OrgSettings.telemetryRetentionDays` and `incidentRetentionDays` are enforced
  by the single scheduled cleanup at `GET /api/cron/retention`
  (`apps/web/app/api/cron/retention/route.ts`). There is no other automatic
  deletion path.
- The route accepts only `Authorization: Bearer <CRON_SECRET>` and compares it
  in constant time. When `CRON_SECRET` is unset it returns `503` before any
  database read or write, so the job fails closed rather than deleting
  unauthenticated. A missing or wrong header returns `401`.
- The secret is server-only. It is never returned in a response, written to an
  audit row or sent to the browser, and the route is `force-dynamic`.
- Deletion is cutoff-based and bounded: at most 5,000 rows per batch and 20
  batches per organisation and table per invocation. There is no unbounded
  full-table delete, and rows newer than the cutoff are not selected. A stored
  period that is not a positive number is skipped.
- `AlertDelivery` rows are removed with their incident inside one batch
  transaction. `DeviceCommand` rows are not deleted; their incident link is
  set to null by the existing foreign key.
- Every run writes one `AuditLog` row per organisation: action
  `retention.cleanup`, target organisation, and metadata with the cutoffs,
  configured days, deleted counts, batch counts, `dryRun` and `truncated`.
  Audit metadata contains no coordinates, phone numbers, plate numbers,
  evidence or raw rows.
- The route is idempotent and has no cross-invocation lock. Vercel can deliver
  a scheduled run more than once; a duplicate run simply finds fewer rows.

## Platform administration

- A platform administrator is a separate `PlatformAdmin` row keyed to a
  `User`, not a `Membership` and not a `MemberRole`. It grants `/platform` only.
  A tenant `ADMIN` has no access to `/platform`; a platform admin with no
  membership has no tenant access. The two sessions are separate cookies
  (`lifelink_platform_session` carries `scope: "platform"`), so neither token
  can be replayed as the other.
- **Access gate.** `/platform` and its actions are enabled only when
  `PLATFORM_ADMIN_ENABLED=true` **and** either MFA is configured or
  `PLATFORM_ADMIN_ALLOW_WITHOUT_MFA=true` is explicitly set. No MFA provider is
  implemented in this deployment, so `platformMfaConfigured()` is always false
  and the allow-without-MFA flag is the only way to open the console today.
  **Real customers require MFA before the platform console is used with
  production data.** The allow-without-MFA flag is for local development only
  and is refused when `NODE_ENV=production`; a production build must use real
  MFA. The console shows a warning while the development flag is active. Do not
  describe this as MFA.
- **Suspension is immediate.** `Organization.status` is `ACTIVE` or
  `SUSPENDED`. `getCurrentUser` re-reads the membership and its organization on
  every request, so a suspended organization resolves to null and an existing
  session stops on the next request. Login verifies the password first, then
  rejects a suspended organization with a message that access is unavailable;
  it does not show the internal suspension note. Reinstate clears
  `suspendedAt`, `suspendedReason` and `suspendedBy`.
- **Every mutation is reasoned and audited.** Suspend and reinstate require a
  5 to 500 character reason and the operator's current password (step-up,
  verified against the platform admin's own bcrypt hash, never a form value).
  Each action writes one `AuditLog` row: `platform.org_suspended` or
  `platform.org_reinstated`, with the actor, organization, reason and
  before/after status in `metadata`. Step-up attempts are rate-limited per
  platform user.
- **Scope of suspension.** Suspension blocks human access to the tenant console
  and API. It does not disable the tracker ingest and alert-delivery path,
  which authenticates with a device token and is not a membership capability.
  Disabling crash alerting for a tenant is a separate safety decision, not a
  side effect of a billing or abuse suspension.
- **Self-lockout decision.** A platform operator may suspend any tenant
  organization, including one where they also hold a membership. `/platform` is
  separate, so this cannot lock them out of the platform console. There is no
  self-suspension path for the platform area itself.
- **RLS.** `PlatformAdmin` is global, not org-scoped, because the operator must
  see every organization. Its migration enables RLS with a deny-all policy;
  only the table owner (the Prisma connection) can read or write it. Do not
  grant it to `lifelink_rls_test`, PostgREST or any tenant role.
- **Payload hygiene.** Admin list and detail queries use explicit `select`
  fields and mappers. The platform organization list, tenant member list,
  tracker list/detail and vehicle list/detail never select `tokenHash`,
  `passwordHash`, `p256dh`, `auth`, `endpoint` or a raw device token.
  `apps/web/lib/security/admin-payload.test.ts` fails if a forbidden field is
  added.

### Creating a platform administrator

Local demo: `pnpm seed` creates `platform@lifelink.local` / `Platform123!` with
no tenant membership. Enable the gate in `.env` and restart the dev server:

```
PLATFORM_ADMIN_ENABLED=true
PLATFORM_ADMIN_ALLOW_WITHOUT_MFA=true
```

Production: choose a trusted `User` with a bcrypt password and insert the row
with the owner connection. There is no invitation or email path for platform
administrators, and the demo seed is the only place a demo credential exists.

```sql
INSERT INTO "PlatformAdmin" ("id", "userId", "createdBy")
VALUES ('platform-admin-1', '<user-id>', NULL);
```

Do not create the row through a tenant session, a public endpoint or a
self-service form.

## Dependencies

Run `pnpm audit` and keep the lockfile under review. The stack deliberately uses
a small dependency set; add a package only when it replaces more code than it
brings.
