-- Additive password reset schema. Apply after a verified backup, before web cutover.
BEGIN;
SET LOCAL timezone TO 'UTC';
DO $config$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC'); END $config$;
DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PasswordResetStatus') THEN
          CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED');
        END IF;
      END
      $$;
ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "password_reset_requests" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "userEmail" TEXT NOT NULL,
        "userName" TEXT NOT NULL,
        "userRole" "Role" NOT NULL,
        "portalContext" TEXT,
        "status" "PasswordResetStatus" NOT NULL DEFAULT 'PENDING',
        "trackerTokenHash" TEXT,
        "resetTokenHash" TEXT,
        "reviewedById" TEXT,
        "reviewedByName" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "expiresAt" TIMESTAMP(3),
        "usedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "requestIp" TEXT,
        "tenantId" TEXT NOT NULL DEFAULT 'default',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "password_reset_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "password_reset_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_requests_trackerTokenHash_key"
      ON "password_reset_requests"("trackerTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_requests_resetTokenHash_key"
      ON "password_reset_requests"("resetTokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_requests_userId_status_idx"
      ON "password_reset_requests"("userId", "status");
CREATE INDEX IF NOT EXISTS "password_reset_requests_status_createdAt_idx"
      ON "password_reset_requests"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "password_reset_requests_tenantId_status_idx"
      ON "password_reset_requests"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "password_reset_requests_userEmail_status_idx" ON "password_reset_requests"("userEmail", "status");
COMMIT;
