-- 0003_admin_soft_delete
-- Add soft-delete columns for admin-managed configuration entities.
-- ParameterDictionaryEntry keys remain unique and can be restored in-place.

ALTER TABLE "ParameterDictionaryEntry" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ParameterDictionaryEntry" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "IpAllowlistEntry" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "IpAllowlistEntry" ADD COLUMN "deletedBy" TEXT;

CREATE INDEX "ParameterDictionaryEntry_deletedAt_idx" ON "ParameterDictionaryEntry"("deletedAt");
CREATE INDEX "IpAllowlistEntry_routeGroup_isActive_deletedAt_idx" ON "IpAllowlistEntry"("routeGroup", "isActive", "deletedAt");
