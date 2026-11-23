-- CANCEL_ALERT now carries two incident identifiers for two different readers.
--
-- The device payload keeps the tracker's own client incident id (`llk-...`) in
-- `incident_id`, because that is what the firmware compares with g_incidentId.
-- The command row keeps the server ImpactEvent id so the ACK route and the
-- incident detail can find the incident without parsing or trusting the device
-- payload. Only CANCEL_ALERT sets this column; other command kinds leave it null.

ALTER TABLE "DeviceCommand" ADD COLUMN "impactEventId" TEXT;

-- Link any CANCEL_ALERT row created before this column existed. The early
-- build put the server id in the payload; the current build sends the device
-- client id there and sets impactEventId directly when it queues the command.
UPDATE "DeviceCommand" c
SET "impactEventId" = i."id"
FROM "ImpactEvent" i
WHERE c."kind" = 'CANCEL_ALERT'
  AND c."impactEventId" IS NULL
  AND c."payload"->>'incident_id' = i."id";

ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_impactEventId_fkey"
  FOREIGN KEY ("impactEventId") REFERENCES "ImpactEvent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeviceCommand_impactEventId_kind_createdAt_idx"
  ON "DeviceCommand"("impactEventId", "kind", "createdAt");
