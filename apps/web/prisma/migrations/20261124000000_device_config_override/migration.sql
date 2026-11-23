-- Per-device overrides for the six server-driven firmware configuration fields.
--
-- A null column means "use the organisation default"; the application deletes
-- the row when every field inherits again. `deviceId` is unique because a
-- tracker has at most one override set. The row is scoped to the device's
-- organisation as well, so the direct-orgId RLS policy below can apply.
--
-- Prisma connects as the owner and bypasses RLS; the application's org filters
-- remain the authoritative tenant boundary. The policy is defense-in-depth for
-- PostgREST or any future non-owner application role, matching the other
-- direct-orgId tables.

CREATE TABLE "DeviceConfigOverride" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "impactThresholdG" DOUBLE PRECISION,
    "tiltThresholdDeg" DOUBLE PRECISION,
    "confirmWindowMs" INTEGER,
    "cancelWindowS" INTEGER,
    "heartbeatIntervalS" INTEGER,
    "sosRetryS" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceConfigOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceConfigOverride_deviceId_key" ON "DeviceConfigOverride"("deviceId");
CREATE INDEX "DeviceConfigOverride_orgId_idx" ON "DeviceConfigOverride"("orgId");

ALTER TABLE "DeviceConfigOverride" ADD CONSTRAINT "DeviceConfigOverride_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceConfigOverride" ADD CONSTRAINT "DeviceConfigOverride_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceConfigOverride" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON "DeviceConfigOverride";
CREATE POLICY "org_isolation" ON "DeviceConfigOverride"
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
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "DeviceConfigOverride" TO lifelink_rls_test';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'DeviceConfigOverride grants were skipped; the migration role lacks grant authority';
    END;
  END IF;
END $$;
