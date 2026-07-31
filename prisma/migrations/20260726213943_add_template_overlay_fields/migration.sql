-- Add overlay fields for visual report template editor
ALTER TABLE "LabReportTemplate" ADD COLUMN IF NOT EXISTS "overlayFields" JSONB DEFAULT '[]';

-- Add pregnancy flag for per-order pregnancy status
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "pregnancy" BOOLEAN DEFAULT false;

-- Add pregnancy flag for pregnancy-specific reference ranges
ALTER TABLE "LabFieldRange" ADD COLUMN IF NOT EXISTS "pregnancy" BOOLEAN;

-- Add blood group to patient
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT;
