-- One-time migration to bring the Coolify database IPD schema in sync.
-- Run automatically from docker-entrypoint.sh before prisma db push.

-- IpdWard
CREATE TABLE IF NOT EXISTS "IpdWard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IpdWard_pkey" PRIMARY KEY ("id")
);

-- IpdBed
CREATE TABLE IF NOT EXISTS "IpdBed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IpdBed_pkey" PRIMARY KEY ("id")
);

-- IpdAdmission (only if it doesn't exist yet)
CREATE TABLE IF NOT EXISTS "IpdAdmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "wardId" TEXT,
    "bedId" TEXT,
    "attendingDoctorId" TEXT NOT NULL,
    "doctorName" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "patientType" TEXT NOT NULL,
    "billingMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'admitted',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDischarge" TIMESTAMP(3),
    "lastRoundAt" TIMESTAMP(3),
    "lastRoundNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IpdAdmission_pkey" PRIMARY KEY ("id")
);

-- Default fallback ward/bed so existing rows can be assigned a valid reference.
INSERT INTO "IpdWard" ("id", "tenantId", "branchId", "label", "category", "updatedAt")
VALUES ('ward_emergency_default', 'tenant_navayu', 'branch_gurgaon', 'Emergency Ward', 'general', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "IpdBed" ("id", "tenantId", "branchId", "wardId", "label", "updatedAt")
VALUES ('bed_emergency_default', 'tenant_navayu', 'branch_gurgaon', 'ward_emergency_default', 'EB-1', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Add missing wardId/bedId columns to an existing IpdAdmission table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IpdAdmission' AND column_name = 'wardId') THEN
        ALTER TABLE "IpdAdmission" ADD COLUMN "wardId" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'IpdAdmission' AND column_name = 'bedId') THEN
        ALTER TABLE "IpdAdmission" ADD COLUMN "bedId" TEXT;
    END IF;
END $$;

-- Backfill existing IPD admissions with the default ward/bed so non-null constraints can be applied
UPDATE "IpdAdmission" SET "wardId" = 'ward_emergency_default' WHERE "wardId" IS NULL;
UPDATE "IpdAdmission" SET "bedId" = 'bed_emergency_default' WHERE "bedId" IS NULL;

-- Ensure required columns are non-null
ALTER TABLE "IpdAdmission" ALTER COLUMN "wardId" SET NOT NULL;
ALTER TABLE "IpdAdmission" ALTER COLUMN "bedId" SET NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "IpdWard_tenantId_branchId_active_idx" ON "IpdWard"("tenantId", "branchId", "active");
CREATE INDEX IF NOT EXISTS "IpdBed_tenantId_branchId_wardId_active_idx" ON "IpdBed"("tenantId", "branchId", "wardId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "IpdBed_wardId_label_key" ON "IpdBed"("wardId", "label");
CREATE INDEX IF NOT EXISTS "IpdAdmission_tenantId_branchId_status_idx" ON "IpdAdmission"("tenantId", "branchId", "status");
CREATE INDEX IF NOT EXISTS "IpdAdmission_branchId_wardId_bedId_idx" ON "IpdAdmission"("branchId", "wardId", "bedId");
CREATE INDEX IF NOT EXISTS "IpdAdmission_branchId_patientId_idx" ON "IpdAdmission"("branchId", "patientId");
CREATE UNIQUE INDEX IF NOT EXISTS "IpdAdmission_visitId_key" ON "IpdAdmission"("visitId");

-- Foreign keys
ALTER TABLE "IpdWard" DROP CONSTRAINT IF EXISTS "IpdWard_branchId_fkey";
ALTER TABLE "IpdWard" ADD CONSTRAINT "IpdWard_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IpdBed" DROP CONSTRAINT IF EXISTS "IpdBed_branchId_fkey";
ALTER TABLE "IpdBed" ADD CONSTRAINT "IpdBed_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IpdBed" DROP CONSTRAINT IF EXISTS "IpdBed_wardId_fkey";
ALTER TABLE "IpdBed" ADD CONSTRAINT "IpdBed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "IpdWard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IpdAdmission" DROP CONSTRAINT IF EXISTS "IpdAdmission_branchId_fkey";
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IpdAdmission" DROP CONSTRAINT IF EXISTS "IpdAdmission_patientId_fkey";
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IpdAdmission" DROP CONSTRAINT IF EXISTS "IpdAdmission_wardId_fkey";
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "IpdWard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IpdAdmission" DROP CONSTRAINT IF EXISTS "IpdAdmission_bedId_fkey";
ALTER TABLE "IpdAdmission" ADD CONSTRAINT "IpdAdmission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "IpdBed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
