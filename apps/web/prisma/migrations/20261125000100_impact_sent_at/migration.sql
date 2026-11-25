-- Device send time and console receipt anchor, for the thesis transmission-time
-- measurement.
--
-- The firmware captures `sent_at` once, when the countdown expires and the
-- emergency alert starts, and repeats the same value on every retry of that
-- incident. It derives the value from the countdown end, so a loop that notices
-- the expiry late after a blocking modem call does not inflate the measurement.
--
-- `confirmedReceivedAt` is the console receipt time of the CONFIRMED report, the
-- dispatched one. `createdAt` is the row creation time and belongs to the
-- SUSPECTED report, which arrives before the countdown ends and cannot anchor
-- the delay. The interval measured is alert start to console receipt, including
-- the SMS attempts that run before the incident HTTP post.
--
-- Both columns are nullable on purpose: firmware that predates the field and a
-- tracker whose GPS clock was never set have no send time, and the console must
-- show no claim rather than invent one. The route stores a value only when the
-- device clock passes the same plausibility check as `detected_at`.
--
-- Prisma connects as the owner and bypasses RLS; the existing org_isolation
-- policy on ImpactEvent still applies to any non-owner application role, so no
-- new policy is needed for these columns.

ALTER TABLE "ImpactEvent" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "ImpactEvent" ADD COLUMN "confirmedReceivedAt" TIMESTAMP(3);
