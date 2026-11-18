-- Three LifeLink roles:
--   USER      vehicle owner, scoped to their own vehicles
--   RESPONDER CDRRMO / Pulis, sees the organization fleet and works incidents
--   ADMIN     manages members, trackers, settings and the fleet
--
-- Existing OWNER/ADMIN members become ADMIN, OPERATOR members become RESPONDER,
-- and VIEWER members become USER (least privilege; they own no vehicles yet).

ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
CREATE TYPE "MemberRole" AS ENUM ('USER', 'RESPONDER', 'ADMIN');

ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership"
  ALTER COLUMN "role" TYPE "MemberRole"
  USING (
    CASE "role"::text
      WHEN 'OWNER' THEN 'ADMIN'
      WHEN 'ADMIN' THEN 'ADMIN'
      WHEN 'OPERATOR' THEN 'RESPONDER'
      WHEN 'VIEWER' THEN 'USER'
      ELSE 'USER'
    END
  )::"MemberRole";
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "MemberRole_old";

-- A vehicle owner sees only the vehicles linked to their user row.
ALTER TABLE "Vehicle" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Vehicle_ownerId_idx" ON "Vehicle"("ownerId");
