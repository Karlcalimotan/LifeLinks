-- Attach emergency contacts to a vehicle so the alert paths can prefer the
-- people the owner registered for that car, with the organisation phone and
-- email list as the fleet fallback.
--
-- `vehicleId` is nullable: a null row is an organisation-level contact that
-- only an admin can create. The relation cascades on vehicle deletion because
-- a contact has no meaning without its vehicle; the console archives a vehicle
-- (status RETIRED) instead of deleting one that has incidents or a tracker.
--
-- The existing `EmergencyContact_orgId_phone_key` unique index is intentionally
-- kept: one phone is one person in an organisation. A contact shared by two
-- vehicles stays on its primary vehicle rather than being duplicated.
--
-- Prisma connects as the owner and bypasses RLS. The existing org_isolation
-- policy on this table (20261122000000_rls_org_policies) still applies to any
-- non-owner application role, so no new policy is needed for this column.

ALTER TABLE "EmergencyContact" ADD COLUMN "vehicleId" TEXT;

CREATE INDEX "EmergencyContact_orgId_vehicleId_active_idx"
  ON "EmergencyContact"("orgId", "vehicleId", "active");

ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
