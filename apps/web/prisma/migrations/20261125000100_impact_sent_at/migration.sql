-- Device send time, for the thesis transmission-time measurement.
--
-- The firmware captures `sent_at` once, when the countdown expires and the
-- emergency alert starts, and repeats the same value on every retry of that
-- incident. The console subtracts it from `createdAt` (its own receipt time) to
-- report how long the report took to arrive.
--
-- Nullable on purpose: firmware that predates the field and a tracker whose GPS
-- clock was never set have no send time, and the console must show no claim
-- rather than invent one. The route stores a value only when the device clock
-- passes the same plausibility check as `detected_at`.
--
-- Prisma connects as the owner and bypasses RLS; the existing org_isolation
-- policy on ImpactEvent still applies to any non-owner application role, so no
-- new policy is needed for this column.

ALTER TABLE "ImpactEvent" ADD COLUMN "sentAt" TIMESTAMP(3);
