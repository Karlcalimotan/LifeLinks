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

## Dependencies

Run `pnpm audit` and keep the lockfile under review. The stack deliberately uses
a small dependency set; add a package only when it replaces more code than it
brings.
