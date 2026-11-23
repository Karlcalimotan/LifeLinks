-- Member invitations, soft revocation and the per-member permission overlay.
--
-- `Membership.revokedAt` is a soft revoke: the row keeps the person, the role
-- and the audit trail so an admin can re-invite them. `Membership.invitedBy`
-- is the id of the admin whose invitation created or last renewed the row.
--
-- `MembershipPermission` stores only explicit overrides. A missing row means
-- "use the role default" (see apps/web/lib/auth/permissions.ts).
--
-- `InvitationToken.tokenHash` is the SHA-256 of a 32-byte base64url token. The
-- plaintext is never stored. `usedAt` is set on acceptance, or when a newer
-- invitation for the same organization and email supersedes the token.
--
-- Prisma connects as the owner and bypasses RLS; the application's org filters
-- remain the authoritative tenant boundary. The policies below are
-- defense-in-depth for PostgREST or any future non-owner application role,
-- matching the other tables in 20261122000000_rls_org_policies.

ALTER TABLE "Membership" ADD COLUMN "invitedBy" TEXT;
ALTER TABLE "Membership" ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "Membership_orgId_revokedAt_idx" ON "Membership"("orgId", "revokedAt");

CREATE TABLE "MembershipPermission" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipPermission_membershipId_key_key"
  ON "MembershipPermission"("membershipId", "key");
CREATE INDEX "MembershipPermission_membershipId_idx"
  ON "MembershipPermission"("membershipId");

ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvitationToken" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'USER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitationToken_tokenHash_key" ON "InvitationToken"("tokenHash");
CREATE INDEX "InvitationToken_orgId_email_idx" ON "InvitationToken"("orgId", "email");
CREATE INDEX "InvitationToken_orgId_createdAt_idx" ON "InvitationToken"("orgId", "createdAt");

ALTER TABLE "InvitationToken" ADD CONSTRAINT "InvitationToken_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvitationToken" ADD CONSTRAINT "InvitationToken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipPermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvitationToken" ENABLE ROW LEVEL SECURITY;

-- MembershipPermission has no orgId of its own; it reaches the tenant through
-- its membership, like TelemetrySample reaches it through the device.
DROP POLICY IF EXISTS "org_isolation" ON "MembershipPermission";
CREATE POLICY "org_isolation" ON "MembershipPermission"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."id" = "MembershipPermission"."membershipId"
        AND m."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."id" = "MembershipPermission"."membershipId"
        AND m."orgId" = public.current_app_org_id()
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON "InvitationToken";
CREATE POLICY "org_isolation" ON "InvitationToken"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

-- The verification role was granted on the tables that existed when
-- 20261122000000_rls_org_policies ran. Grant the new tables the same four
-- privileges, guarded so a database without the role still migrates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifelink_rls_test') THEN
    BEGIN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MembershipPermission" TO lifelink_rls_test';
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "InvitationToken" TO lifelink_rls_test';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Member invitation grants were skipped; the migration role lacks grant authority';
    END;
  END IF;
END $$;
