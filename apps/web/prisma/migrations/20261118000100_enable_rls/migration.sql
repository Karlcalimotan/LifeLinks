-- Supabase hardening: the public schema is reachable through PostgREST when the
-- Data API is enabled. LifeLink talks to Postgres through Prisma as the
-- `postgres` role, which bypasses RLS, so enabling RLS here does not affect the
-- application. Add explicit policies only if a Supabase client is introduced.
--
-- `_prisma_migrations` is included so the migration history is not readable
-- through the Data API either.

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
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
