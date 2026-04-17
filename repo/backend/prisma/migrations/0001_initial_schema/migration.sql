-- GreenCycle Warehouse & Content Operations API
-- Initial schema migration (authored, not executed)
-- SQLite DDL

-- ============================
-- AUTH & INFRASTRUCTURE
-- ============================

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL DEFAULT 1,
    "encryptionKeyVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "IpAllowlistEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "routeGroup" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "principalId" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RateLimitBucket_principalId_windowStart_idx" ON "RateLimitBucket"("principalId", "windowStart");

CREATE TABLE "EncryptionKeyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "algorithm" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "keyHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME,
    "expiresAt" DATETIME
);
CREATE UNIQUE INDEX "EncryptionKeyVersion_version_key" ON "EncryptionKeyVersion"("version");

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeDigest" TEXT,
    "afterDigest" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");
CREATE INDEX "AuditEvent_actor_idx" ON "AuditEvent"("actor");
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

CREATE TABLE "ParameterDictionaryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ParameterDictionaryEntry_key_key" ON "ParameterDictionaryEntry"("key");

CREATE TABLE "BackupSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" DATETIME,
    "restoredBy" TEXT
);

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- ============================
-- WAREHOUSE
-- ============================

CREATE TABLE "Facility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");

CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Zone_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Zone_facilityId_code_key" ON "Zone"("facilityId", "code");
CREATE INDEX "Zone_facilityId_idx" ON "Zone"("facilityId");

CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "zoneId" TEXT,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RACK',
    "capacityCuFt" REAL NOT NULL,
    "hazardClass" TEXT NOT NULL DEFAULT 'NONE',
    "temperatureBand" TEXT NOT NULL DEFAULT 'AMBIENT',
    "isPickFace" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Location_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");
CREATE INDEX "Location_facilityId_code_idx" ON "Location"("facilityId", "code");

CREATE TABLE "Sku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "abcClass" TEXT NOT NULL DEFAULT 'C',
    "unitWeightLb" REAL NOT NULL,
    "unitVolumeCuFt" REAL NOT NULL,
    "hazardClass" TEXT NOT NULL DEFAULT 'NONE',
    "temperatureBand" TEXT NOT NULL DEFAULT 'AMBIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "Sku_code_key" ON "Sku"("code");

CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expirationDate" DATETIME,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "InventoryLot_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryLot_skuId_lotNumber_expirationDate_idx" ON "InventoryLot"("skuId", "lotNumber", "expirationDate");
CREATE INDEX "InventoryLot_locationId_idx" ON "InventoryLot"("locationId");

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "expiredAt" DATETIME,
    "carrierId" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Appointment_facilityId_state_idx" ON "Appointment"("facilityId", "state");
CREATE INDEX "Appointment_state_createdAt_idx" ON "Appointment"("state", "createdAt");

CREATE TABLE "AppointmentOperationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "priorState" TEXT NOT NULL,
    "newState" TEXT NOT NULL,
    "reason" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppointmentOperationHistory_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AppointmentOperationHistory_appointmentId_idx" ON "AppointmentOperationHistory"("appointmentId");

-- ============================
-- OUTBOUND EXECUTION
-- ============================

CREATE TABLE "OutboundOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "referenceNumber" TEXT,
    "requestedShipDate" DATETIME,
    "approvedForPartialShip" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "OutboundOrder_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OutboundOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityFulfilled" INTEGER NOT NULL DEFAULT 0,
    "quantityShort" INTEGER NOT NULL DEFAULT 0,
    "lineType" TEXT NOT NULL DEFAULT 'STANDARD',
    "sourceLineId" TEXT,
    "shortageReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboundOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OutboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrderLine_sourceLineId_fkey" FOREIGN KEY ("sourceLineId") REFERENCES "OutboundOrderLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "OutboundOrderLine_orderId_idx" ON "OutboundOrderLine"("orderId");

CREATE TABLE "Wave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wave_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Wave_idempotencyKey_key" ON "Wave"("idempotencyKey");
CREATE INDEX "Wave_facilityId_idx" ON "Wave"("facilityId");

CREATE TABLE "PickTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "waveId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityPicked" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sequence" INTEGER NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "assignedTo" TEXT,
    "estimatedDistance" REAL,
    "actualDistance" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PickTask_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OutboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickTask_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OutboundOrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickTask_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PickTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PickTask_waveId_idx" ON "PickTask"("waveId");
CREATE INDEX "PickTask_status_completedAt_idx" ON "PickTask"("status", "completedAt");

CREATE TABLE "PackVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "expectedWeightLb" REAL NOT NULL,
    "actualWeightLb" REAL NOT NULL,
    "expectedVolumeCuFt" REAL NOT NULL,
    "actualVolumeCuFt" REAL NOT NULL,
    "weightVariancePct" REAL NOT NULL,
    "volumeVariancePct" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackVerification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OutboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PackVerification_orderId_idx" ON "PackVerification"("orderId");

CREATE TABLE "HandoffRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "handoffBy" TEXT NOT NULL,
    "handoffAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoffRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OutboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HandoffRecord_orderId_idx" ON "HandoffRecord"("orderId");

-- ============================
-- STRATEGY CENTER
-- ============================

CREATE TABLE "StrategyRuleset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fifoWeight" REAL NOT NULL DEFAULT 1.0,
    "fefoWeight" REAL NOT NULL DEFAULT 0.0,
    "abcWeight" REAL NOT NULL DEFAULT 1.0,
    "heatLevelWeight" REAL NOT NULL DEFAULT 1.0,
    "pathCostWeight" REAL NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- ============================
-- MEMBERSHIP & BILLING
-- ============================

CREATE TABLE "Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "encryptionKeyVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
CREATE UNIQUE INDEX "Member_memberNumber_key" ON "Member"("memberNumber");

CREATE TABLE "MembershipPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "durationDays" INTEGER,
    "punchCount" INTEGER,
    "storedValue" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

CREATE TABLE "MemberPackageEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "punchesUsed" INTEGER NOT NULL DEFAULT 0,
    "remainingValue" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemberPackageEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberPackageEnrollment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "MembershipPackage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MemberPackageEnrollment_memberId_status_idx" ON "MemberPackageEnrollment"("memberId", "status");

CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT,
    "last4Encrypted" TEXT,
    "encryptionKeyVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "paidAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "retentionExpiresAt" DATETIME,
    CONSTRAINT "PaymentRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "MemberPackageEnrollment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentRecord_invoiceNumber_key" ON "PaymentRecord"("invoiceNumber");
CREATE INDEX "PaymentRecord_memberId_idx" ON "PaymentRecord"("memberId");
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");

-- ============================
-- CMS
-- ============================

CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isTombstone" BOOLEAN NOT NULL DEFAULT false,
    "canonicalTagId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Tag_canonicalTagId_fkey" FOREIGN KEY ("canonicalTagId") REFERENCES "Tag" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Tag_normalizedName_key" ON "Tag"("normalizedName");

CREATE TABLE "TagAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TagAlias_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TagAlias_tagId_idx" ON "TagAlias"("tagId");
CREATE INDEX "TagAlias_normalizedAlias_idx" ON "TagAlias"("normalizedAlias");

CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "publishedAt" DATETIME,
    "scheduledPublishAt" DATETIME,
    "withdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Article_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
CREATE INDEX "Article_state_publishedAt_idx" ON "Article"("state", "publishedAt");
CREATE INDEX "Article_authorId_idx" ON "Article"("authorId");

CREATE TABLE "ArticleTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ArticleTag_articleId_tagId_key" ON "ArticleTag"("articleId", "tagId");

CREATE TABLE "ArticleCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleCategory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ArticleCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ArticleCategory_articleId_categoryId_key" ON "ArticleCategory"("articleId", "categoryId");

CREATE TABLE "ArticleInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleInteraction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ArticleInteraction_articleId_idx" ON "ArticleInteraction"("articleId");
CREATE INDEX "ArticleInteraction_createdAt_idx" ON "ArticleInteraction"("createdAt");
CREATE INDEX "ArticleInteraction_type_createdAt_idx" ON "ArticleInteraction"("type", "createdAt");
