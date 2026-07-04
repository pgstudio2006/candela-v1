// @ts-nocheck
import { prisma } from "@/lib/prisma";
import {
  buildSeedAttendance,
  buildSeedLeave,
  buildSeedPayroll,
  buildSeedShifts,
  SEED_HR_DEPARTMENTS,
  SEED_HR_EMPLOYEES,
} from "@/design-system/hr-data";
import { SEED_HR_PASSWORDS } from "@/lib/hr-auth";
import {
  SEED_CRM_AGENTS,
  SEED_CRM_LEADS,
} from "@/design-system/crm-data";
import {
  SEED_ADMIN_SETTINGS,
  SEED_DEPARTMENTS,
  SEED_DISEASE_CLUSTERS,
  SEED_DISEASE_MAP,
  SEED_EXPENSES,
  SEED_GEO,
  SEED_MIS,
  SEED_MRD,
  SEED_REVENUE_POLICIES,
  SEED_STAFF,
} from "@/design-system/admin-data";
import { PATIENTS, VISITS } from "@/design-system/frontdesk-data";
import { isDemoSeedEnabled } from "@/lib/demo-seed";
import { ensureHospitalBootstrap } from "@/server/hospital-bootstrap";

const ADMIN_SETTINGS_ID = "admin_settings";
let bootstrapPromise: Promise<void> | null = null;

async function seedCoreData() {
  if (!isDemoSeedEnabled()) return;
  if (await prisma.patient.count()) return;
  await prisma.patient.createMany({
    data: PATIENTS.map((p) => ({
      ...p,
      tags: p.tags,
    })),
    skipDuplicates: true,
  });
  await prisma.opdVisit.createMany({
    data: VISITS,
    skipDuplicates: true,
  });
}

async function seedHrData() {
  if (await prisma.hrEmployee.count()) return;
  await prisma.hrDepartment.createMany({
    data: SEED_HR_DEPARTMENTS,
    skipDuplicates: true,
  });
  await prisma.hrEmployee.createMany({
    data: SEED_HR_EMPLOYEES,
    skipDuplicates: true,
  });
  const { hashPassword } = await import("@/server/revenue/password");
  await prisma.hrCredential.createMany({
    data: await Promise.all(
      Object.entries(SEED_HR_PASSWORDS).map(async ([employeeId, password]) => ({
        employeeId,
        password: await hashPassword(password),
      })),
    ),
    skipDuplicates: true,
  });
  await prisma.hrShift.createMany({
    data: buildSeedShifts(),
    skipDuplicates: true,
  });
  await prisma.hrLeaveRequest.createMany({
    data: buildSeedLeave().map((x) => ({
      ...x,
      syncCrmAbsence: Boolean(x.syncCrmAbsence),
    })),
    skipDuplicates: true,
  });
  await prisma.hrAttendance.createMany({
    data: buildSeedAttendance(),
    skipDuplicates: true,
  });
  await prisma.hrPayrollLine.createMany({
    data: buildSeedPayroll(),
    skipDuplicates: true,
  });
  await prisma.hrSetting.upsert({
    where: { id: "hr_settings" },
    update: {},
    create: {
      id: "hr_settings",
      autoCrmSync: true,
      leaveApprovalNotify: true,
      attendanceReminder: false,
    },
  });
}

async function seedCrmData() {
  if (await prisma.crmAgent.count()) return;
  await prisma.crmAgent.createMany({
    data: SEED_CRM_AGENTS.map((a) => ({
      ...a,
      specialtyTags: a.specialtyTags,
    })),
    skipDuplicates: true,
  });
  await prisma.crmLead.createMany({
    data: SEED_CRM_LEADS.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      phone: l.phone,
      stageId: l.stageId,
      assigneeId: l.assigneeId,
      source: l.source,
      valueEstimate: l.valueEstimate,
      priority: l.priority,
      tags: l.tags,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      convertedVisitId: l.convertedVisitId,
      lostReason: l.lostReason,
    })),
    skipDuplicates: true,
  });
}

async function seedAdminData() {
  if (await prisma.adminStaff.count()) return;
  await prisma.adminStaff.createMany({
    data: SEED_STAFF.map((x) => ({
      ...x,
      departmentIds: x.departmentIds,
    })),
    skipDuplicates: true,
  });
  await prisma.adminDepartment.createMany({
    data: SEED_DEPARTMENTS.map((x) => ({
      ...x,
      doctorIds: x.doctorIds,
      defaultPackageIds: x.defaultPackageIds,
      bays: x.bays,
    })),
    skipDuplicates: true,
  });
  await prisma.adminDiseaseNode.createMany({
    data: SEED_DISEASE_MAP.map((x) => ({
      ...x,
      packageIds: x.packageIds,
      consentTemplateIds: x.consentTemplateIds,
    })),
    skipDuplicates: true,
  });
  await prisma.adminGeoPin.createMany({
    data: SEED_GEO,
    skipDuplicates: true,
  });
  await prisma.adminDiseaseCluster.createMany({
    data: SEED_DISEASE_CLUSTERS,
    skipDuplicates: true,
  });
  await prisma.adminExpense.createMany({
    data: SEED_EXPENSES,
    skipDuplicates: true,
  });
  await prisma.adminRevenuePolicy.createMany({
    data: SEED_REVENUE_POLICIES,
    skipDuplicates: true,
  });
  await prisma.adminMrdRequest.createMany({
    data: SEED_MRD.map((x) => ({
      ...x,
      documents: x.documents,
    })),
    skipDuplicates: true,
  });
  await prisma.adminMisReport.createMany({
    data: SEED_MIS,
    skipDuplicates: true,
  });
  await prisma.adminSetting.upsert({
    where: { id: ADMIN_SETTINGS_ID },
    update: {},
    create: {
      id: ADMIN_SETTINGS_ID,
      ...SEED_ADMIN_SETTINGS,
      resolvedLeakageIds: [],
    },
  });
}

async function backfillAdminBranchScope() {
  const firstTenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!firstTenant) return;
  const firstBranch = await prisma.branch.findFirst({
    where: { tenantId: firstTenant.id },
    orderBy: { createdAt: "asc" },
  });
  if (!firstBranch) return;

  const adminWhere = { tenantId: null, branchId: null };
  const ipdWhere = { tenantId: "", branchId: "" };
  await Promise.all([
    prisma.adminDepartment.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminDiseaseNode.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminDiseaseCluster.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminGeoPin.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminRevenuePolicy.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminMrdRequest.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminMisReport.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminAuditLog.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.formSubmission.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.doctorTemplate.updateMany({ where: adminWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.documentTemplate.updateMany({ where: { tenantId: null, branchId: null }, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
    prisma.adminExpense.updateMany({ where: { branchId: null }, data: { branchId: firstBranch.id } }),
    prisma.ipdAdmission.updateMany({ where: ipdWhere, data: { tenantId: firstTenant.id, branchId: firstBranch.id } }),
  ]);
}

async function runBootstrap() {
  await ensureHospitalBootstrap();
  await backfillAdminBranchScope();
  if (!isDemoSeedEnabled()) return;
  await seedCoreData();
  await seedCrmData();
  await seedHrData();
  await seedAdminData();
  await backfillAdminBranchScope();
}

export async function ensureBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  await bootstrapPromise;
}

export { ADMIN_SETTINGS_ID };
