-- Post-dispatch false alarm: the operator asks the tracker to stand down.
--
-- The device accepts CANCEL_ALERT while counting down or while retrying a
-- dispatched incident. The web keeps the incident status until the tracker
-- acknowledges, so a new column records when the request was made. The command
-- payload is frozen in docs/delegation-plan.md:
--   { "incident_id": "<ImpactEvent.id>", "reason": "false_alarm", "all_clear": true }

ALTER TYPE "CommandKind" ADD VALUE 'CANCEL_ALERT';

ALTER TABLE "ImpactEvent" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
