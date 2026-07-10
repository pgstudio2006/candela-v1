-- CreateTable
CREATE TABLE "EmergencyPatient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mlc" BOOLEAN NOT NULL DEFAULT false,
    "mlcDetails" TEXT,
    "broughtBy" TEXT,
    "policeStation" TEXT,
    "firNumber" TEXT,
    "complaint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyPatient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyPatient_patientId_key" ON "EmergencyPatient"("patientId");

-- CreateIndex
CREATE INDEX "EmergencyPatient_tenantId_branchId_status_idx" ON "EmergencyPatient"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "EmergencyPatient_branchId_patientId_idx" ON "EmergencyPatient"("branchId", "patientId");

-- AddForeignKey
ALTER TABLE "EmergencyPatient" ADD CONSTRAINT "EmergencyPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
