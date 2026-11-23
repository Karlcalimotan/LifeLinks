-- Bureau acknowledgement for a dispatched incident.
--
-- The firmware latches Alerting until ACK_INCIDENT for the active device client
-- incident id (`llk-...`). The command row keeps the server ImpactEvent id in
-- `impactEventId`, exactly like CANCEL_ALERT, so the ACK route resolves the
-- incident from the command and never from the device payload.
--
-- `ackRequestedAt` records that the portal asked for the acknowledgement. It is
-- cleared when the tracker answers, so a failed or expired request can be
-- retried. The incident status changes only when the tracker confirms.

ALTER TYPE "CommandKind" ADD VALUE 'ACK_INCIDENT';

ALTER TABLE "ImpactEvent" ADD COLUMN "ackRequestedAt" TIMESTAMP(3);
