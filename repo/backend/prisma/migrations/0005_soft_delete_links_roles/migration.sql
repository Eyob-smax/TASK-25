-- Add soft-delete/activity metadata for role assignments and article relation links.
-- This removes hard-delete pressure from role replacement and tag/category reassociation flows.

ALTER TABLE "UserRole" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserRole" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "UserRole" ADD COLUMN "deletedBy" TEXT;
CREATE INDEX "UserRole_userId_isActive_idx" ON "UserRole"("userId", "isActive");

ALTER TABLE "ArticleTag" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ArticleTag" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ArticleTag" ADD COLUMN "deletedBy" TEXT;

ALTER TABLE "ArticleCategory" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ArticleCategory" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "ArticleCategory" ADD COLUMN "deletedBy" TEXT;
