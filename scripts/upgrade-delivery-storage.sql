-- Additive upgrade; retains all existing records and legacy base64 images.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- AlterTable
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "cnicImagePath" TEXT,
ADD COLUMN IF NOT EXISTS "cnicImageSize" INTEGER,
ADD COLUMN IF NOT EXISTS "deliveryDocImageData" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryDocImageMime" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryDocImagePath" TEXT,
ADD COLUMN IF NOT EXISTS "deliveryDocImageSize" INTEGER,
ADD COLUMN IF NOT EXISTS "dlsImagePath" TEXT,
ADD COLUMN IF NOT EXISTS "dlsImageSize" INTEGER;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "incomingDocCapturedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "incomingDocMime" TEXT,
ADD COLUMN IF NOT EXISTS "incomingDocPath" TEXT,
ADD COLUMN IF NOT EXISTS "incomingDocSize" INTEGER,
ADD COLUMN IF NOT EXISTS "outgoingDocCapturedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "outgoingDocMime" TEXT,
ADD COLUMN IF NOT EXISTS "outgoingDocPath" TEXT,
ADD COLUMN IF NOT EXISTS "outgoingDocSize" INTEGER,
ADD COLUMN IF NOT EXISTS "vehicleNoNormalized" TEXT;

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "senderName" TEXT,
ADD COLUMN IF NOT EXISTS "senderPhone" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "visits_vehicleNo_idx" ON "visits"("vehicleNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "visits_vehicleNoNormalized_idx" ON "visits"("vehicleNoNormalized");

COMMIT;
