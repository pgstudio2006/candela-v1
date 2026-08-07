ALTER TABLE "AdminStaff"
  ADD COLUMN "degree" TEXT,
  ADD COLUMN "designation" TEXT,
  ADD COLUMN "signature" TEXT;

ALTER TABLE "LabOrder"
  ADD COLUMN "reportedByStaffId" TEXT,
  ADD COLUMN "reportedByName" TEXT;
