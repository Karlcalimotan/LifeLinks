-- Raise the default impact threshold to 15 g. The MPU-6050 now runs its
-- ±16 g range so a 15 g impact is measurable without clipping.
--
-- This changes the default for new organizations only. Existing organizations
-- keep their stored value and can change it from Settings; the local demo row
-- is updated separately after this migration.
ALTER TABLE "OrgSettings" ALTER COLUMN "impactThresholdG" SET DEFAULT 15;
