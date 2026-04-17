-- 0002_member_number_hash
-- Adds a deterministic HMAC-SHA-256 hash column of plaintext memberNumber
-- (keyed by ENCRYPTION_MASTER_KEY) to enable O(1) uniqueness lookup, replacing
-- the previous O(n) application-level decrypt-scan. Existing rows stay as-is;
-- the column is nullable and `@unique` still applies only to non-null values.

ALTER TABLE "Member" ADD COLUMN "memberNumberHash" TEXT;
CREATE UNIQUE INDEX "Member_memberNumberHash_key" ON "Member"("memberNumberHash");
