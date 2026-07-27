ALTER TABLE "DocumentTemplate"
  ADD COLUMN "fileData" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "marginTop" INTEGER,
  ADD COLUMN "marginBottom" INTEGER,
  ADD COLUMN "marginLeft" INTEGER,
  ADD COLUMN "marginRight" INTEGER,
  ADD COLUMN "overlayFields" JSONB,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

