-- AlterTable
ALTER TABLE "WhatsAppLog" ADD COLUMN "messageId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppLog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "WhatsAppLog_messageId_idx" ON "WhatsAppLog"("messageId");
