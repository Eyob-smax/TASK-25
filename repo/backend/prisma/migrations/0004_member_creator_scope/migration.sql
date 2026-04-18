-- 0004_member_creator_scope
-- Add optional creator linkage for Member records to support object-level scope.

ALTER TABLE "Member" ADD COLUMN "createdBy" TEXT;

CREATE INDEX "Member_createdBy_deletedAt_idx" ON "Member"("createdBy", "deletedAt");
