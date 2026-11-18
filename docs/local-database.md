# Database (Supabase)

LifeLink uses **Supabase Postgres**. There is no local Docker database and no
`docker-compose.yml`; development, preview and production all point at a Supabase
project.

## 1. Create the project

1. Create a project in the Supabase dashboard.
2. Open **Project Settings → Database** and copy the connection strings.
3. Use two different URLs:

| Variable | Supabase connection | Port | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | Transaction pooler | `6543` | The Next.js app at runtime |
| `DIRECT_URL` | Session pooler (or direct) | `5432` | Migrations, introspection, seed |

The transaction pooler URL must include `?pgbouncer=true&connection_limit=1` for
serverless deployments. Prisma migrations must not run through the transaction
pooler; that is why `DIRECT_URL` exists in `prisma/schema.prisma`.

Supabase's newer projects expose the pooler on `aws-0-<region>.pooler.supabase.com`
with the username `postgres.<project-ref>`. The direct host
`db.<project-ref>.supabase.co` is IPv6-only on many projects; the session pooler
on port `5432` is the practical choice when your network has no IPv6 route.

## 2. Configure the app

```bash
cp apps/web/.env.example apps/web/.env
```

Fill in the two URLs from the dashboard:

```dotenv
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Also set a real `AUTH_SECRET` and `CRON_SECRET`. `.env` is ignored by Git; never
commit real credentials.

## 3. Apply the schema and demo data

```bash
pnpm prisma:deploy
SEED_DEMO=yes pnpm seed
```

PowerShell:

```powershell
$env:SEED_DEMO="yes"; pnpm seed
```

`prisma:deploy` applies `prisma/migrations` through `DIRECT_URL`. The seed is
idempotent, prints the demo login and the device tokens, and refuses a remote
database unless `SEED_DEMO=yes` acknowledges the target.

Use a dedicated development Supabase project for the seed. Do not point
`SEED_DEMO=yes` at production.

This app reaches Postgres through Prisma, not the Supabase client. Disable the
Supabase **Data API** for the project (Project Settings → API) unless you add
explicit RLS policies; otherwise the `public` schema may be reachable through
PostgREST with an anon key.

The **anon key** and **service-role key** are API keys, not database credentials.
Prisma cannot connect with them. Keep the service-role key server-side only; it
bypasses RLS. The optional `NEXT_PUBLIC_SUPABASE_*` variables exist only for a
future Supabase client integration and can stay empty.

The `20261118000100_enable_rls` migration enables row-level security on every
application table. Prisma uses the `postgres` role, which bypasses RLS, so the
app is unaffected. If you later use the Supabase client, add explicit policies
for the tables it needs; otherwise the Data API returns no rows.

## 4. Deploying

Set `DATABASE_URL` and `DIRECT_URL` as environment variables in your host
(Vercel → Project → Settings → Environment Variables). Use the pooled URL for
`DATABASE_URL` and keep `DIRECT_URL` available to the migration step.

## Any other PostgreSQL

A plain PostgreSQL 14+ instance works the same way. Set both variables to its
connection string (or set `DIRECT_URL` equal to `DATABASE_URL`). A dedicated role
and database keep this schema apart from other projects.

## Troubleshooting

- `P1001: Can't reach database server` — the host/port is wrong, the project is
  paused, or your network cannot reach the pooler. Confirm the region and port.
- `P1000: Authentication failed` — the password or the `postgres.<project-ref>`
  username is wrong. Reset the database password in Supabase if needed.
- `P3018: migration failed` — the target already contains a partial schema. Use a
  fresh Supabase project; do not reset a shared one.
- `prepared statement "s0" already exists` — the app is pointed at port `5432`
  through a transaction pooler. Use port `6543` with `?pgbouncer=true` for
  `DATABASE_URL`.
- `prisma generate` is not a database call. It works without credentials, which
  is why `pnpm install` can generate the client before Supabase is configured.
