-- Platform administration and organization suspension.
--
-- `PlatformAdmin` is global and deliberately separate from `Membership` and
-- `MemberRole`. It grants access to the `/platform` console only; a platform
-- operator with no membership has no tenant access. It is not org-scoped
-- because the operator must see every organization.
--
-- The table has RLS enabled with a deny-all policy. Prisma connects as the
-- table owner and bypasses RLS by design, which is the only supported path.
-- Any non-owner role (PostgREST, a future app role, `lifelink_rls_test`) sees
-- no rows and cannot write. This is stronger than an org-scoped policy: a
-- platform administrator must never be reachable through a tenant session.
--
-- `Organization.status` is the tenant kill switch. `getCurrentUser` re-reads
-- the membership and its organization on every request, so a SUSPENDED
-- organization stops an existing session on the next request. Login rejects a
-- suspended organization after the password check. The suspension note stays
-- in `suspendedReason` and is never shown to a tenant member.

CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "Organization"
  ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT,
  ADD COLUMN "suspendedBy" TEXT;

CREATE INDEX "Organization_status_createdAt_idx" ON "Organization"("status", "createdAt");

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformAdmin" ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all for every non-owner role. The table owner (the Prisma
-- connection) bypasses RLS unless FORCE ROW LEVEL SECURITY is set, which this
-- migration deliberately does not do.
DROP POLICY IF EXISTS "platform_admin_owner_only" ON "PlatformAdmin";
CREATE POLICY "platform_admin_owner_only" ON "PlatformAdmin"
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);
