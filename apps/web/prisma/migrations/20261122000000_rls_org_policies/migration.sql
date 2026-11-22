-- Per-organization row-level security.
--
-- Prisma connects as the database owner (`postgres` in Supabase, `ci` in CI).
-- The owner bypasses RLS, so these policies are defense-in-depth for any
-- non-owner role: PostgREST, a future application role, or the
-- `lifelink_rls_test` verification role. The application's orgId filters remain
-- the authoritative tenant boundary; RLS alone is not the boundary.
--
-- The tenant is selected with a transaction-local setting:
--
--   SELECT set_config('app.current_org_id', '<org id>', true);
--
-- If the setting is absent or empty, every policy evaluates false (fail closed).
-- The owner connection does not need the setting and is unaffected.

CREATE OR REPLACE FUNCTION public.current_app_org_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '');
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifelink_rls_test') THEN
    BEGIN
      EXECUTE 'CREATE ROLE lifelink_rls_test NOLOGIN';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'lifelink_rls_test was not created; non-owner RLS verification needs CREATEROLE';
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifelink_rls_test') THEN
    BEGIN
      EXECUTE format('GRANT lifelink_rls_test TO %I', current_user);
      EXECUTE 'GRANT USAGE ON SCHEMA public TO lifelink_rls_test';
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lifelink_rls_test';
      EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lifelink_rls_test';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'lifelink_rls_test grants were skipped; the migration role lacks grant authority';
    END;
  END IF;
END $$;

-- RLS is already enabled by 20261118000100_enable_rls. Re-assert it here so the
-- policies cannot silently do nothing on a partially migrated database.
ALTER TABLE "AlertDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceCommand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceStateEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Geofence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImpactEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrgSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelemetrySample" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackerDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trip" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;

-- Direct orgId tables.

DROP POLICY IF EXISTS "org_isolation" ON "Membership";
CREATE POLICY "org_isolation" ON "Membership"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "Vehicle";
CREATE POLICY "org_isolation" ON "Vehicle"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "TrackerDevice";
CREATE POLICY "org_isolation" ON "TrackerDevice"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "Trip";
CREATE POLICY "org_isolation" ON "Trip"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "ImpactEvent";
CREATE POLICY "org_isolation" ON "ImpactEvent"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "EmergencyContact";
CREATE POLICY "org_isolation" ON "EmergencyContact"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "Geofence";
CREATE POLICY "org_isolation" ON "Geofence"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "OrgSettings";
CREATE POLICY "org_isolation" ON "OrgSettings"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "AuditLog";
CREATE POLICY "org_isolation" ON "AuditLog"
  FOR ALL TO PUBLIC
  USING ("orgId" = public.current_app_org_id())
  WITH CHECK ("orgId" = public.current_app_org_id());

DROP POLICY IF EXISTS "org_isolation" ON "Organization";
CREATE POLICY "org_isolation" ON "Organization"
  FOR ALL TO PUBLIC
  USING ("id" = public.current_app_org_id())
  WITH CHECK ("id" = public.current_app_org_id());

-- Tables without a direct orgId reach the organization through a parent.

DROP POLICY IF EXISTS "org_isolation" ON "TelemetrySample";
CREATE POLICY "org_isolation" ON "TelemetrySample"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "TelemetrySample"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "TelemetrySample"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON "AlertDelivery";
CREATE POLICY "org_isolation" ON "AlertDelivery"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "ImpactEvent" i
      WHERE i."id" = "AlertDelivery"."impactEventId"
        AND i."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ImpactEvent" i
      WHERE i."id" = "AlertDelivery"."impactEventId"
        AND i."orgId" = public.current_app_org_id()
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON "DeviceCommand";
CREATE POLICY "org_isolation" ON "DeviceCommand"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "DeviceCommand"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "DeviceCommand"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON "DeviceStateEvent";
CREATE POLICY "org_isolation" ON "DeviceStateEvent"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "DeviceStateEvent"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "TrackerDevice" d
      WHERE d."id" = "DeviceStateEvent"."deviceId"
        AND d."orgId" = public.current_app_org_id()
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON "User";
CREATE POLICY "org_isolation" ON "User"
  FOR ALL TO PUBLIC
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User"."id"
        AND m."orgId" = public.current_app_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User"."id"
        AND m."orgId" = public.current_app_org_id()
    )
  );
