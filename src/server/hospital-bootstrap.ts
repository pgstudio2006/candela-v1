import { prisma } from "@/lib/prisma";
import { DEFAULT_DOCUMENT_TEMPLATES } from "@/design-system/document-templates";
import { DOCTOR_TEMPLATES } from "@/design-system/doctor-data";
import { SEED_ADMIN_SETTINGS } from "@/design-system/admin-data";
import { isDemoSeedEnabled } from "@/lib/demo-seed";
import { stripLegacyDemoDoctorsFromDepartments } from "@/server/admin/doctor-department-sync";

const ADMIN_SETTINGS_ID = "admin_settings";

const MINIMAL_DEPARTMENTS = [
  {
    id: "dept_spine",
    label: "Spine & Joint Care",
    headStaffId: null as string | null,
    doctorIds: [] as string[],
    defaultPackageIds: ["pkg_basic", "pkg_regen"],
    revenuePolicyId: null as string | null,
    bays: ["Physio Bay 1", "Physio Bay 2", "Procedure Room"],
    active: true,
  },
  {
    id: "dept_wellness",
    label: "Wellness & Metabolic",
    headStaffId: null,
    doctorIds: [] as string[],
    defaultPackageIds: ["pkg_wellness"],
    revenuePolicyId: null,
    bays: ["Wellness Studio"],
    active: true,
  },
];

/** Production-safe bootstrap: structure only — no demo staff, patients, or legacy doctors. */
export async function ensureHospitalBootstrap() {
  await stripLegacyDemoDoctorsFromDepartments();

  if (!(await prisma.adminDepartment.count())) {
    await prisma.adminDepartment.createMany({
      data: MINIMAL_DEPARTMENTS,
      skipDuplicates: true,
    });
  }

  if (!(await prisma.adminSetting.findUnique({ where: { id: ADMIN_SETTINGS_ID } }))) {
    await prisma.adminSetting.create({
      data: {
        id: ADMIN_SETTINGS_ID,
        ...SEED_ADMIN_SETTINGS,
        resolvedLeakageIds: [],
      },
    });
  }

  for (const template of DEFAULT_DOCUMENT_TEMPLATES) {
    await prisma.documentTemplate.upsert({
      where: { id: template.id },
      update: {},
      create: template,
    }).catch(() => undefined);
  }

  if (!(await prisma.doctorTemplate.count())) {
    for (const template of DOCTOR_TEMPLATES) {
      await prisma.doctorTemplate
        .create({
          data: {
            id: template.id,
            label: template.label,
            doctorId: template.doctorId,
            disease: template.disease,
            diagnosis: template.diagnosis,
            treatment: template.treatment,
            prescription: template.prescription,
            isSystem: true,
          },
        })
        .catch(() => undefined);
    }
  }

  if (isDemoSeedEnabled()) {
    const { seedDemoAdminBundle } = await import("@/server/demo-admin-bundle");
    await seedDemoAdminBundle();
  }
}

export { ADMIN_SETTINGS_ID };
