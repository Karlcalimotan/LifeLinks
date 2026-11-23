-- Row-level security for Web Push subscriptions.
--
-- `PushSubscription` stores a capability URL and the browser's keys, so every
-- non-owner role must see only the rows of the organization it is acting for.
-- 20261118000100_enable_rls predates this table and 20261122000000_rls_org_policies
-- predates it as well, so both the enablement, the policy and the verification
-- role's grants are added here.
--
-- The policy is the direct-orgId form, matching Membership, Vehicle, Trip and
-- the other tables that carry their own `orgId`. With no
-- `app.current_org_id` setting, `public.current_app_org_id()` is NULL and the
-- policy fails closed.
--
-- Prisma connects as the owner and bypasses RLS; the application's user/org
-- filters remain the authoritative tenant boundary. This is defense-in-depth
-- for PostgREST or any future non-owner application role.

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "PushSubscription";
CREATE POLICY "org_isolation" ON "PushSubscription"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

-- The verification role was granted on the tables that existed when
-- 20261122000000_rls_org_policies ran. Grant the new table the same four
-- privileges, guarded so a database without the role still migrates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifelink_rls_test') THEN
    BEGIN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PushSubscription" TO lifelink_rls_test';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'PushSubscription grants were skipped; the migration role lacks grant authority';
    END;
  END IF;
END $$;
